const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { WaAccount } = require("../models/WaAccount");
const settings = require("../config/settings");

class WhatsappSessionManager {
  constructor() {
    this.clients = new Map();
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
      return account;
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: account.clientId,
        dataPath: settings.authDataPath,
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

  async sendTextMessage(accountId, recipient, text) {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error("WhatsApp session is not active for this account.");
    }

    const normalized = this.normalizeRecipient(recipient);
    if (!normalized) {
      throw new Error("Recipient number is invalid.");
    }

    const numberId = await client.getNumberId(normalized);
    if (!numberId?._serialized) {
      throw new Error(`Recipient ${normalized} is not a valid WhatsApp number.`);
    }

    try {
      const result = await client.sendMessage(numberId._serialized, text);
      return result?.id?._serialized || null;
    } catch (error) {
      if (typeof error?.message === "string" && error.message.includes("No LID for user")) {
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
