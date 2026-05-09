const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const { WaAccount } = require("../models/WaAccount");
const replyInboxService = require("./replyInboxService");
const { emitSessionStatus } = require("./replyEvents");
const { normalizeNumber, toWhatsAppRecipient } = require("../utils/phone");
const AUTH_DATA_PATH = process.env.AUTH_DATA_PATH || process.env.WHATSAPP_AUTH_DIR || ".wwebjs_auth";

class WhatsappSessionManager {
  constructor() {
    this.clients = new Map();
    this.startingSessions = new Map();
    this.clientActivities = new Map();
    this.intentionalSleeps = new Set();
    this.idleTimer = setInterval(() => this.checkIdleSessions(), 60000);
  }

  recordActivity(accountId) {
    this.clientActivities.set(String(accountId), Date.now());
  }
  
  clearChromeLock(clientId) {
    try {
      const sessionDir = path.resolve(AUTH_DATA_PATH, `session-${clientId}`);
      const filesToCleanup = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
      for (const fileName of filesToCleanup) {
        const filePath = path.join(sessionDir, fileName);
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
        }
      }
    } catch (err) {
      console.warn(`[WHATSAPP] Lock clear warning for ${clientId}:`, err.message);
    }
  }

  async checkIdleSessions() {
    const now = Date.now();
    for (const [accountId, lastActive] of this.clientActivities.entries()) {
      if (now - lastActive > 3 * 60 * 1000) {
        try {
          await this.sleepSession(accountId);
        } catch (_error) {
          // Ignore
        }
      }
    }
  }

  isRecoverableProtocolError(error) {
    const message = String(error?.message || "");
    return (
      message.includes("Execution context was destroyed") ||
      message.includes("Cannot find context with specified id") ||
      message.includes("Target closed") ||
      message.includes("Session closed")
    );
  }

  isProfileLockedError(error) {
    const message = String(error?.message || "");
    return message.includes("The browser is already running for");
  }

  async resetClient(accountId, reason = "Session reset requested.") {
    const mapKey = String(accountId);
    const client = this.clients.get(mapKey);
    if (client) {
      try {
        await client.destroy();
      } catch (_error) {
        // Ignore destroy errors while resetting stale clients.
      } finally {
        this.clients.delete(mapKey);
      }
    }

    await this.updateAccount(accountId, {
      status: "disconnected",
      qrCodeDataUrl: null,
      lastError: reason,
    });
  }

  hasClient(accountId) {
    return this.clients.has(String(accountId));
  }

  async updateAccount(accountId, update) {
    await WaAccount.findByIdAndUpdate(accountId, update, { returnDocument: "before" });
  }

  async startSession(accountId) {
    const mapKey = String(accountId);
    const inFlightStart = this.startingSessions.get(mapKey);
    if (inFlightStart) {
      return inFlightStart;
    }

    const startPromise = this.startSessionInternal(accountId, mapKey);
    this.startingSessions.set(mapKey, startPromise);

    try {
      return await startPromise;
    } finally {
      this.startingSessions.delete(mapKey);
    }
  }

  async startSessionInternal(accountId, mapKey) {
    const account = await WaAccount.findById(accountId);
    if (!account || !account.isActive) {
      throw new Error("Account not found or inactive.");
    }

    if (this.clients.has(mapKey)) {
      const existingClient = this.clients.get(mapKey);
      try {
        await existingClient.getState();
        return account;
      } catch (error) {
        if (!this.isRecoverableProtocolError(error)) {
          throw error;
        }
        await this.resetClient(
          account._id,
          "Recovered from stale browser context. Please scan QR again if prompted.",
        );
      }
    }
    this.clearChromeLock(account.clientId);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: account.clientId,
        dataPath: AUTH_DATA_PATH,
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          `--window-size=${1280 + Math.floor(Math.random() * 200)},${800 + Math.floor(Math.random() * 200)}`,
        ],
      },
    });

    client.on("qr", async (qr) => {
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(qr, { width: 300 });
        await this.updateAccount(account._id, {
          status: "qr_ready",
          qrCodeDataUrl,
          lastError: null,
        });
        emitSessionStatus(account.owner, account._id, "qr_ready", { qrCodeDataUrl });
      } catch (error) {
        await this.updateAccount(account._id, {
          status: "auth_failure",
          lastError: `QR generation failed: ${error.message}`,
        });
        emitSessionStatus(account.owner, account._id, "auth_failure", { lastError: `QR generation failed: ${error.message}` });
      }
    });

    client.on("authenticated", async () => {
      this.recordActivity(account._id);
      await this.updateAccount(account._id, {
        status: "initializing",
        lastError: null,
      });
      emitSessionStatus(account.owner, account._id, "initializing");
    });

    client.on("ready", async () => {
      this.recordActivity(account._id);
      const phoneNumber = client.info?.wid?.user || null;
      await this.updateAccount(account._id, {
        status: "authenticated",
        phoneNumber,
        lastConnectedAt: new Date(),
        qrCodeDataUrl: null,
        lastError: null,
      });
      emitSessionStatus(account.owner, account._id, "authenticated", { phoneNumber });
    });

    client.on("auth_failure", async (message) => {
      await this.updateAccount(account._id, {
        status: "auth_failure",
        lastError: message || "Authentication failure.",
      });
      emitSessionStatus(account.owner, account._id, "auth_failure", { lastError: message || "Authentication failure." });
    });

    client.on("disconnected", async (reason) => {
      if (this.intentionalSleeps.has(mapKey)) {
        this.intentionalSleeps.delete(mapKey);
        return;
      }
      this.clients.delete(mapKey);
      await this.updateAccount(account._id, {
        status: "disconnected",
        qrCodeDataUrl: null,
        lastError: typeof reason === "string" ? reason : "Disconnected from WhatsApp Web.",
      });
      emitSessionStatus(account.owner, account._id, "disconnected", { lastError: typeof reason === "string" ? reason : "Disconnected from WhatsApp Web." });
    });

    client.on("message", async (message) => {
      this.recordActivity(account._id);
      try {
        if (!message || message.fromMe) {
          return;
        }

        const fromRaw = String(message.from || "");
        const fromNumber = await this.resolveInboundSenderNumber(message, fromRaw);
        if (!fromNumber && !fromRaw) {
          return;
        }

        const inferredTo =
          this.normalizeRecipient(String(message.to || "")) ||
          this.normalizeRecipient(String(client.info?.wid?._serialized || "")) ||
          account.phoneNumber ||
          null;

        await replyInboxService.recordInboundMessage({
          ownerId: account.owner,
          accountId: account._id,
          fromNumber,
          providerChatId: fromRaw || null,
          toNumber: inferredTo,
          text: typeof message.body === "string" ? message.body : "",
          providerMessageId: message.id?._serialized || null,
          messageType: message.type || "text",
          sentAt: Number.isFinite(Number(message.timestamp))
            ? new Date(Number(message.timestamp) * 1000)
            : new Date(),
        });
      } catch (_error) {
        // Ignore inbound persistence errors to avoid breaking session events.
      }
    });

    this.clients.set(mapKey, client);
    await this.updateAccount(account._id, {
      status: "initializing",
      lastError: null,
    });

    try {
      await new Promise((resolve, reject) => {
        let finished = false;
        const cleanup = () => {
          client.off("ready", onReady);
          client.off("qr", onQr);
          client.off("auth_failure", onAuthFailure);
          client.off("disconnected", onDisconnected);
        };
        const onReady = () => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve();
        };
        const onQr = () => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve();
        };
        const onAuthFailure = (msg) => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(new Error(msg || "Auth failure"));
        };
        const onDisconnected = (reason) => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(new Error(typeof reason === "string" ? reason : "Disconnected during init"));
        };

        client.on("ready", onReady);
        client.on("qr", onQr);
        client.on("auth_failure", onAuthFailure);
        client.on("disconnected", onDisconnected);

        client.initialize().catch((err) => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(err);
        });

        // Timeout after 45 seconds
        setTimeout(() => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve(); // Resolve anyway to avoid hanging forever, health check will see current state
        }, 45000);
      });
    } catch (error) {
      this.clients.delete(mapKey);
      const errorMessage = this.isProfileLockedError(error)
        ? "Session is already open in another browser process. Stop that process and retry."
        : error.message;
      await this.updateAccount(account._id, {
        status: "auth_failure",
        lastError: errorMessage,
      });
      throw new Error(errorMessage);
    }

    let finalAccount = await WaAccount.findById(account._id);
    // If it's still "initializing", wait a few seconds for the 'ready' event's DB update to commit
    if (finalAccount && finalAccount.status === "initializing") {
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        finalAccount = await WaAccount.findById(account._id);
        if (finalAccount.status !== "initializing") break;
      }
    }

    return finalAccount;
  }

  async stopSession(accountId) {
    const mapKey = String(accountId);
    const inFlightStart = this.startingSessions.get(mapKey);
    if (inFlightStart) {
      await inFlightStart.catch(() => { });
    }

    const client = this.clients.get(mapKey);
    if (client) {
      await client.destroy();
      this.clients.delete(mapKey);
    }
    this.clientActivities.delete(mapKey);
    await this.updateAccount(accountId, {
      status: "disconnected",
      qrCodeDataUrl: null,
      lastError: null,
    });
    return WaAccount.findById(accountId);
  }

  async sleepSession(accountId) {
    const mapKey = String(accountId);
    const inFlightStart = this.startingSessions.get(mapKey);
    if (inFlightStart) {
      await inFlightStart.catch(() => { });
    }

    const client = this.clients.get(mapKey);
    if (client) {
      this.intentionalSleeps.add(mapKey);
      await client.destroy();
      this.clients.delete(mapKey);
    }
    this.clientActivities.delete(mapKey);
    // DO NOT update database status. Leave it as "authenticated" for UI.
    return WaAccount.findById(accountId);
  }

  getClient(accountId) {
    return this.clients.get(String(accountId)) || null;
  }

  normalizeRecipient(recipient) {
    return normalizeNumber(String(recipient || "")) || "";
  }

  toSendableRecipient(recipient) {
    return toWhatsAppRecipient(String(recipient || "")) || "";
  }

  extractUserFromChatId(chatId) {
    const raw = String(chatId || "");
    if (!raw.toLowerCase().endsWith("@c.us")) {
      return "";
    }
    return this.normalizeRecipient(raw.split("@")[0] || "");
  }

  async resolveInboundSenderNumber(message, fromRaw) {
    const chatId = String(fromRaw || "").toLowerCase();
    if (
      chatId.endsWith("@g.us") ||
      chatId.endsWith("@broadcast") ||
      chatId.endsWith("@newsletter")
    ) {
      return "";
    }

    const directNumber = this.extractUserFromChatId(fromRaw);
    if (directNumber) {
      return directNumber;
    }

    try {
      const contact = await message.getContact();
      const contactNumber =
        this.normalizeRecipient(String(contact?.number || "")) ||
        this.extractUserFromChatId(contact?.id?._serialized || "") ||
        this.extractUserFromChatId(`${contact?.id?.user || ""}@${contact?.id?.server || ""}`);
      if (contactNumber) {
        return contactNumber;
      }
    } catch (_error) {
      // Ignore contact resolution errors.
    }

    try {
      const chat = await message.getChat();
      return (
        this.extractUserFromChatId(chat?.id?._serialized || "") ||
        this.extractUserFromChatId(`${chat?.id?.user || ""}@${chat?.id?.server || ""}`) ||
        ""
      );
    } catch (_error) {
      return "";
    }
  }

  async resolveRecipientChatId(client, normalized) {
    const candidates = [normalized, `+${normalized}`];
    for (const candidate of candidates) {
      try {
        const numberId = await client.getNumberId(candidate);
        if (numberId?._serialized) {
          return numberId._serialized;
        }
      } catch (error) {
        if (typeof error?.message === "string" && error.message.includes("No LID for user")) {
          continue;
        }
        throw error;
      }
    }

    // Fallback path: let sendMessage validate registration directly.
    return `${normalized}@c.us`;
  }

  async sendTextMessageDetailed(accountId, recipient, text) {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error("WhatsApp session is not active for this account.");
    }

    const normalized = this.toSendableRecipient(recipient);
    if (!normalized) {
      throw new Error("Recipient number is invalid.");
    }

    try {
      const chatId = await this.resolveRecipientChatId(client, normalized);
      const result = await client.sendMessage(chatId, text);
      this.recordActivity(accountId);
      return {
        providerMessageId: result?.id?._serialized || null,
        providerChatId: chatId || null,
      };
    } catch (error) {
      if (this.isRecoverableProtocolError(error)) {
        await this.resetClient(
          accountId,
          "WhatsApp browser context reset. Open Show QR and reconnect the session.",
        );
        throw new Error("Session context was reset. Please open Show QR and reconnect.");
      }
      if (typeof error?.message === "string" && error.message.includes("No LID for user")) {
        throw new Error(`Recipient ${normalized} is not reachable on WhatsApp.`);
      }
      if (
        typeof error?.message === "string" &&
        (error.message.includes("invalid wid") ||
          error.message.includes("not a valid WhatsApp number"))
      ) {
        throw new Error(`Recipient ${normalized} is not reachable on WhatsApp.`);
      }
      throw error;
    }
  }

  async sendTextMessage(accountId, recipient, text) {
    const result = await this.sendTextMessageDetailed(accountId, recipient, text);
    return result?.providerMessageId || null;
  }

  parseMediaDataUrl(mediaData, fallbackMime = "application/octet-stream") {
    if (typeof mediaData !== "string") {
      throw new Error("Media payload is invalid.");
    }

    const match = mediaData.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      throw new Error("Media payload format is invalid.");
    }

    return {
      mimeType: match[1] || fallbackMime,
      base64Data: match[2],
    };
  }

  async sendMediaMessageDetailed(accountId, recipient, media, caption = "") {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error("WhatsApp session is not active for this account.");
    }

    const normalized = this.toSendableRecipient(recipient);
    if (!normalized) {
      throw new Error("Recipient number is invalid.");
    }

    try {
      const chatId = await this.resolveRecipientChatId(client, normalized);

      const parsed = this.parseMediaDataUrl(media?.mediaData, media?.mediaMimeType);
      const messageMedia = new MessageMedia(
        parsed.mimeType,
        parsed.base64Data,
        media?.mediaFileName || undefined,
      );

      const result = await client.sendMessage(chatId, messageMedia, {
        caption: caption || undefined,
      });
      this.recordActivity(accountId);
      return {
        providerMessageId: result?.id?._serialized || null,
        providerChatId: chatId || null,
      };
    } catch (error) {
      if (this.isRecoverableProtocolError(error)) {
        await this.resetClient(
          accountId,
          "WhatsApp browser context reset. Open Show QR and reconnect the session.",
        );
        throw new Error("Session context was reset. Please open Show QR and reconnect.");
      }
      if (typeof error?.message === "string" && error.message.includes("No LID for user")) {
        throw new Error(`Recipient ${normalized} is not reachable on WhatsApp.`);
      }
      if (
        typeof error?.message === "string" &&
        (error.message.includes("invalid wid") ||
          error.message.includes("not a valid WhatsApp number"))
      ) {
        throw new Error(`Recipient ${normalized} is not reachable on WhatsApp.`);
      }
      throw error;
    }
  }

  async sendMediaMessage(accountId, recipient, media, caption = "") {
    const result = await this.sendMediaMessageDetailed(accountId, recipient, media, caption);
    return result?.providerMessageId || null;
  }

  async simulateTyping(accountId, recipient, durationMs = 3000) {
    const client = this.getClient(accountId);
    if (!client) {
      return;
    }

    const normalized = this.toSendableRecipient(recipient);
    if (!normalized) {
      return;
    }

    try {
      const chatId = await this.resolveRecipientChatId(client, normalized);
      const chat = await client.getChatById(chatId);
      if (chat && typeof chat.sendStateTyping === "function") {
        await chat.sendStateTyping();
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        if (typeof chat.clearState === "function") {
          await chat.clearState();
        }
      }
    } catch (_error) {
      // Typing simulation errors are non-fatal.
    }
  }

  async markChatRead(accountId, recipient) {
    const client = this.getClient(accountId);
    if (!client) {
      return;
    }

    const normalized = this.toSendableRecipient(recipient);
    if (!normalized) {
      return;
    }

    try {
      const chatId = await this.resolveRecipientChatId(client, normalized);
      const chat = await client.getChatById(chatId);
      if (chat && typeof chat.sendSeen === "function") {
        await chat.sendSeen();
      }
    } catch (_error) {
      // Read receipt errors are non-fatal.
    }
  }

  getParticipantSerializedId(participant) {
    return (
      participant?.id?._serialized ||
      `${participant?.id?.user || ""}@${participant?.id?.server || ""}` ||
      ""
    );
  }

  getParticipantNumber(participant) {
    return (
      this.normalizeRecipient(String(participant?.id?.user || "")) ||
      this.extractUserFromChatId(this.getParticipantSerializedId(participant)) ||
      ""
    );
  }

  async ensureGroupChat(client, groupId) {
    let chat;
    try {
      chat = await client.getChatById(groupId);
    } catch (_error) {
      throw new Error("Group not found.");
    }

    if (!chat?.isGroup) {
      throw new Error("Selected chat is not a WhatsApp group.");
    }

    return chat;
  }

  buildGroupSummary(chat) {
    const participants = Array.isArray(chat?.participants)
      ? chat.participants
      : Array.isArray(chat?.groupMetadata?.participants)
        ? chat.groupMetadata.participants
        : [];

    return {
      id: chat?.id?._serialized || "",
      name: String(chat?.name || chat?.formattedTitle || "Unnamed group").trim() || "Unnamed group",
      participantCount: participants.length,
    };
  }

  async listGroups(accountId) {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error("WhatsApp session is not active for this account.");
    }

    const chats = await client.getChats();
    return chats
      .filter((chat) => chat?.isGroup)
      .map((chat) => this.buildGroupSummary(chat))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findGroupsByParticipantNumber(accountId, mobileNumber) {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error("WhatsApp session is not active for this account.");
    }

    const normalized = this.normalizeRecipient(mobileNumber);
    if (!normalized) {
      throw new Error("Mobile number is invalid.");
    }

    const chats = await client.getChats();
    return chats
      .filter((chat) => {
        if (!chat?.isGroup) {
          return false;
        }

        const participants = Array.isArray(chat?.participants)
          ? chat.participants
          : Array.isArray(chat?.groupMetadata?.participants)
            ? chat.groupMetadata.participants
            : [];

        return participants.some((participant) => this.getParticipantNumber(participant) === normalized);
      })
      .map((chat) => this.buildGroupSummary(chat))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getGroupParticipants(accountId, groupId) {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error("WhatsApp session is not active for this account.");
    }

    const chat = await this.ensureGroupChat(client, groupId);
    const group = this.buildGroupSummary(chat);
    const participants = Array.isArray(chat?.participants)
      ? chat.participants
      : Array.isArray(chat?.groupMetadata?.participants)
        ? chat.groupMetadata.participants
        : [];

    const rows = await Promise.all(
      participants.map(async (participant) => {
        const participantId = this.getParticipantSerializedId(participant);
        const mobile = this.getParticipantNumber(participant);
        let contact = null;

        if (participantId) {
          try {
            contact = await client.getContactById(participantId);
          } catch (_error) {
            contact = null;
          }
        }

        const accountName =
          String(
            contact?.name ||
            contact?.pushname ||
            contact?.shortName ||
            contact?.verifiedName ||
            "",
          ).trim() || mobile;

        return {
          id: participantId || mobile,
          mobile,
          name: accountName,
          pushName: String(contact?.pushname || "").trim(),
          shortName: String(contact?.shortName || "").trim(),
          verifiedName: String(contact?.verifiedName || "").trim(),
          isAdmin: Boolean(participant?.isAdmin || participant?.isSuperAdmin),
          isSuperAdmin: Boolean(participant?.isSuperAdmin),
        };
      }),
    );

    const uniqueParticipants = Array.from(
      rows.reduce((map, participant) => {
        const key = participant.mobile || participant.id;
        if (!key) {
          return map;
        }
        if (!map.has(key)) {
          map.set(key, participant);
        }
        return map;
      }, new Map()).values(),
    ).sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) {
        return a.isAdmin ? -1 : 1;
      }
      return (a.name || "").localeCompare(b.name || "");
    });

    return {
      group,
      participants: uniqueParticipants,
    };
  }

  async restoreActiveSessions() {
    const accounts = await WaAccount.find({
      isActive: true,
      status: { $in: ["initializing", "authenticated", "qr_ready"] },
    }).select("_id");

    for (const account of accounts) {
      try {
        await this.startSession(account._id);
      } catch (error) {
        await this.updateAccount(account._id, {
          status: "disconnected",
          lastError: `Restore failed: ${error.message}`,
        });
      }
    }
  }
}

module.exports = new WhatsappSessionManager();
