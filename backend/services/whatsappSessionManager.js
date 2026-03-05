const QRCode = require("qrcode");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const { WaAccount } = require("../models/WaAccount");
const AUTH_DATA_PATH = process.env.AUTH_DATA_PATH || process.env.WHATSAPP_AUTH_DIR || ".wwebjs_auth";

class WhatsappSessionManager {
  constructor() {
    this.clients = new Map();
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
    const account = await WaAccount.findById(accountId);
    if (!account || !account.isActive) {
      throw new Error("Account not found or inactive.");
    }

    const mapKey = String(account._id);
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

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: account.clientId,
        dataPath: AUTH_DATA_PATH,
      }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
      } catch (error) {
        await this.updateAccount(account._id, {
          status: "auth_failure",
          lastError: `QR generation failed: ${error.message}`,
        });
      }
    });

    client.on("authenticated", async () => {
      await this.updateAccount(account._id, {
        status: "initializing",
        lastError: null,
      });
    });

    client.on("ready", async () => {
      const phoneNumber = client.info?.wid?.user || null;
      await this.updateAccount(account._id, {
        status: "authenticated",
        phoneNumber,
        lastConnectedAt: new Date(),
        qrCodeDataUrl: null,
        lastError: null,
      });
    });

    client.on("auth_failure", async (message) => {
      await this.updateAccount(account._id, {
        status: "auth_failure",
        lastError: message || "Authentication failure.",
      });
    });

    client.on("disconnected", async (reason) => {
      this.clients.delete(mapKey);
      await this.updateAccount(account._id, {
        status: "disconnected",
        qrCodeDataUrl: null,
        lastError: typeof reason === "string" ? reason : "Disconnected from WhatsApp Web.",
      });
    });

    this.clients.set(mapKey, client);
    await this.updateAccount(account._id, {
      status: "initializing",
      lastError: null,
    });

    try {
      await client.initialize();
    } catch (error) {
      this.clients.delete(mapKey);
      await this.updateAccount(account._id, {
        status: "auth_failure",
        lastError: error.message,
      });
      throw error;
    }

    return WaAccount.findById(account._id);
  }

  async stopSession(accountId) {
    const mapKey = String(accountId);
    const client = this.clients.get(mapKey);
    if (client) {
      await client.destroy();
      this.clients.delete(mapKey);
    }
    await this.updateAccount(accountId, {
      status: "disconnected",
      qrCodeDataUrl: null,
      lastError: null,
    });
    return WaAccount.findById(accountId);
  }

  getClient(accountId) {
    return this.clients.get(String(accountId)) || null;
  }

  normalizeRecipient(recipient) {
    if (!recipient || typeof recipient !== "string") {
      return "";
    }
    return recipient.replace(/[^\d]/g, "");
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

  async sendTextMessage(accountId, recipient, text) {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error("WhatsApp session is not active for this account.");
    }

    const normalized = this.normalizeRecipient(recipient);
    if (!normalized) {
      throw new Error("Recipient number is invalid.");
    }

    try {
      const chatId = await this.resolveRecipientChatId(client, normalized);
      const result = await client.sendMessage(chatId, text);
      return result?.id?._serialized || null;
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

  async sendMediaMessage(accountId, recipient, media, caption = "") {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error("WhatsApp session is not active for this account.");
    }

    const normalized = this.normalizeRecipient(recipient);
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
      return result?.id?._serialized || null;
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
