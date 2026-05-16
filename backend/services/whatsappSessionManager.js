const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const { WaAccount } = require("../models/WaAccount");
const { UserSetting, DEFAULT_PER_MOBILE_DAILY_LIMIT, DEFAULT_PER_MOBILE_HOURLY_LIMIT } = require("../models/UserSetting");
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
    
    // 1. Cleanup sessions with no activity (idle timeout)
    for (const [accountId, lastActive] of this.clientActivities.entries()) {
      if (now - lastActive > 5 * 60 * 1000) {
        try {
          await this.sleepSession(accountId);
        } catch (_error) { /* Ignore */ }
      }
    }

    // 2. Cleanup ghost sessions (account deleted from DB but session still in memory)
    const activeIds = Array.from(this.clients.keys());
    for (const accountId of activeIds) {
      try {
        const exists = await WaAccount.exists({ _id: accountId });
        if (!exists) {
          console.log(`[WHATSAPP] Ghost session detected for ${accountId} (not in DB). Destroying...`);
          await this.sleepSession(accountId).catch(() => {});
          this.clientActivities.delete(String(accountId));
        }
      } catch (err) {
        console.error(`[WHATSAPP] Error checking ghost session ${accountId}:`, err.message);
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
        console.log(`[WHATSAPP] Session DESTROYED (Reset) for account ${accountId}. Total active sessions: ${this.clients.size}`);
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
    const acc = await WaAccount.findById(accountId);
    if (acc) {
      Object.assign(acc, update);
      await acc.save();
    }
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
    let account = await WaAccount.findById(accountId);
    if (!account || !account.isActive) {
      throw new Error("Account not found or inactive.");
    }

    // ── Limit Check ──
    WaAccount.resetDailyWindowIfNeeded(account);
    WaAccount.resetHourlyWindowIfNeeded(account);
    if (account.isModified("sentToday") || account.isModified("sentThisHour")) {
      await account.save();
    }

    const settings = await UserSetting.getOrCreate(account.owner);
    const dailyLimit = account.dailyLimit || settings.perMobileDailyLimit || DEFAULT_PER_MOBILE_DAILY_LIMIT;
    const hourlyLimit = settings.perMobileHourlyLimit || DEFAULT_PER_MOBILE_HOURLY_LIMIT;

    if (account.sentToday >= dailyLimit) {
      throw new Error(`Daily limit reached (${account.sentToday}/${dailyLimit}). Session cannot start.`);
    }
    if (account.sentThisHour >= hourlyLimit) {
      throw new Error(`Hourly limit reached (${account.sentThisHour}/${hourlyLimit}). Session cannot start.`);
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
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--disable-gpu",
          "--no-zygote",
          "--disable-features=site-per-process",
          "--disable-web-security",
          "--disable-blink-features=AutomationControlled",
        ],
      },
      webVersionCache: { type: "none" },
    });

    client.on("qr", async (qr) => {
      console.log(`[WHATSAPP] QR received for account ${account._id}.`);
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(qr, { width: 300 });
        await this.updateAccount(account._id, {
          status: "qr_ready",
          qrCodeDataUrl,
          lastError: null,
        });
        emitSessionStatus(account.owner, account._id, "qr_ready", { qrCodeDataUrl });
      } catch (error) {
        console.error(`[WHATSAPP] QR generation error for ${account._id}:`, error.message);
        await this.updateAccount(account._id, {
          status: "auth_failure",
          lastError: `QR generation failed: ${error.message}`,
        });
        emitSessionStatus(account.owner, account._id, "auth_failure", { lastError: `QR generation failed: ${error.message}` });
      }
    });

    client.on("authenticated", async () => {
      this.recordActivity(account._id);
      console.log(`[WHATSAPP:${account._id}] ✓ Authenticated.`);
      await this.updateAccount(account._id, {
        status: "authenticated",
        qrCodeDataUrl: null,
        lastError: null,
      });
      emitSessionStatus(account.owner, account._id, "authenticated");
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
      console.log(`[WHATSAPP] Account ${account._id} marked as AUTHENTICATED in database.`);
      console.log(`[WHATSAPP] Session READY for account ${account._id}. Total active sessions: ${this.clients.size}`);
      emitSessionStatus(account.owner, account._id, "authenticated", { phoneNumber });
    });

    client.on("auth_failure", async (message) => {
      console.error(`[WHATSAPP] Auth failure for account ${account._id}:`, message);
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
      console.log(`[WHATSAPP] Session DISCONNECTED for account ${account._id}. Reason: ${reason}. Total active sessions: ${this.clients.size}`);
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

    // Guard: if sleepSession() was called while we were initializing in background, abort.
    if (this.intentionalSleeps.has(mapKey)) {
      this.intentionalSleeps.delete(mapKey);
      console.log(`[WHATSAPP] Session for ${account._id} aborted — sleep was requested during startup.`);
      try { client.destroy().catch(() => {}); } catch (_) {}
      throw new Error("Session aborted: sleep was requested during startup.");
    }

    this.clients.set(mapKey, client);
    console.log(`[WHATSAPP] Session OPENED for account ${account._id} (${account.name || account.phoneNumber}). Total active sessions: ${this.clients.size}`);

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

        // Timeout after 90 seconds
        setTimeout(() => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve(); // Resolve anyway to avoid hanging forever, health check will see current state
        }, 90000);
      });
    } catch (error) {
      this.clients.delete(mapKey);
      console.log(`[WHATSAPP] Session FAILED during initialization for account ${account._id}. Total active sessions: ${this.clients.size}`);
      const errorMessage = this.isProfileLockedError(error)
        ? "Session is already open in another browser process. Stop that process and retry."
        : error.message;
      await this.updateAccount(account._id, {
        status: "auth_failure",
        lastError: errorMessage,
      });
      throw new Error(errorMessage);
    }

    // Refresh account data one last time before returning
    return await WaAccount.findById(account._id);
  }

  async stopSession(accountId) {
    const mapKey = String(accountId);
    const inFlightStart = this.startingSessions.get(mapKey);
    if (inFlightStart) {
      await inFlightStart.catch(() => { });
    }

    const client = this.clients.get(mapKey);
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[WHATSAPP] TargetCloseError ignored during destroy for ${accountId}:`, err.message);
      } finally {
        this.clients.delete(mapKey);
        console.log(`[WHATSAPP] Session DESTROYED (Stop) for account ${accountId}. Total active sessions: ${this.clients.size}`);
      }
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

    // Mark as intentional BEFORE doing anything, so if the in-flight start
    // completes during our destroy, it won't re-add to clients.
    this.intentionalSleeps.add(mapKey);

    // If a background startSession is in-flight, do NOT wait for it.
    // Just let it complete on its own — the intentionalSleeps flag will
    // prevent it from being used, and the disconnected event will clean up.
    const inFlightStart = this.startingSessions.get(mapKey);
    if (inFlightStart) {
      // Detach — don't await. The in-flight session will be destroyed
      // by the disconnected event handler once it completes.
      inFlightStart.catch(() => {});
    }

    const client = this.clients.get(mapKey);
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        console.warn(`[WHATSAPP] TargetCloseError ignored during sleep for ${accountId}:`, err.message);
      } finally {
        this.clients.delete(mapKey);
        console.log(`[WHATSAPP] Session DESTROYED (Sleep) for account ${accountId}. Total active sessions: ${this.clients.size}`);
      }
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
    if (normalized.includes("@")) {
      return normalized;
    }

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
    this.recordActivity(accountId);
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
    this.recordActivity(accountId);
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
    this.recordActivity(accountId);
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
    // ── Rule 4: Do NOT auto-start sessions on server boot ──
    // Sessions are opened on-demand by the campaign queue ONLY when:
    //   (a) there is an active campaign with pending messages, AND
    //   (b) the account has not reached its daily/hourly limit.
    // This prevents unnecessary RAM usage from idle Puppeteer processes.

    // Reset any accounts that got stuck in a transient state during a previous crash
    const stuckAccounts = await WaAccount.find({
      isActive: true,
      status: { $in: ["initializing", "qr_ready"] },
    }).select("_id phoneNumber name");

    if (stuckAccounts.length > 0) {
      console.log(`[WHATSAPP] Resetting ${stuckAccounts.length} stuck accounts (initializing/qr_ready → disconnected) on startup.`);
      for (const account of stuckAccounts) {
        await this.updateAccount(account._id, {
          status: "disconnected",
          qrCodeDataUrl: null,
          lastError: "Server restarted — please scan QR to reconnect.",
        });
        console.log(`[WHATSAPP] Reset stuck account: ${account.phoneNumber || account._id}`);
      }
    }

    console.log(`[WHATSAPP] Startup complete. Sessions will open on-demand when campaigns have pending work.`);
  }
}

module.exports = new WhatsappSessionManager();
