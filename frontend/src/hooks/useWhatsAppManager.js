import { useEffect, useMemo, useState } from "react";
import { getMe, login, logout as logoutApi, register } from "../api/authApi";
import {
  createAccount as createAccountApi,
  deleteAccount as deleteAccountApi,
  findAccountGroupsByNumber as findAccountGroupsByNumberApi,
  getAccountGroupParticipants as getAccountGroupParticipantsApi,
  getAccountQr,
  listAccountGroups as listAccountGroupsApi,
  listAccounts,
  startAccount,
  stopAccount,
  updateAccountDailyLimit,
} from "../api/accountsApi";
import {
  createTemplate as createTemplateApi,
  updateTemplate as updateTemplateApi,
  listTemplates,
  deleteTemplate as deleteTemplateApi,
} from "../api/templatesApi";
import {
  createContactCategory as createContactCategoryApi,
  updateContactCategory as updateContactCategoryApi,
  deleteContactCategory as deleteContactCategoryApi,
  listContactCategories,
} from "../api/contactCategoriesApi";
import {
  bulkInsertContacts as bulkInsertContactsApi,
  createContact as createContactApi,
  deleteContact as deleteContactApi,
  listContacts,
} from "../api/contactsApi";
import {
  createCampaign as createCampaignApi,
  getCampaignMessages,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  updateCampaign as updateCampaignApi,
  deleteCampaign as deleteCampaignApi,
} from "../api/campaignsApi";
import {
  getSettings as getSettingsApi,
  updateSettings as updateSettingsApi,
  migrateNumbers as migrateNumbersApi,
} from "../api/settingsApi";
import {
  getConversationMessages as getConversationMessagesApi,
  listConversations as listConversationsApi,
  markConversationRead as markConversationReadApi,
  sendConversationReply as sendConversationReplyApi,
  deleteConversation as deleteConversationApi,
  clearAllChats as clearAllChatsApi,
  clearUnrepliedChats as clearUnrepliedChatsApi,
} from "../api/repliesApi";
import {
  createUser as createUserApi,
  listUsers as listUsersApi,
  resetPassword as resetPasswordApi,
  toggleUserStatus as toggleUserStatusApi,
  updateUser as updateUserApi,
  deleteUser as deleteUserApi,
} from "../api/adminApi";
import { REPLIES_WS_URL } from "../api/client";
import { countRecipients } from "../utils/formatters";

const DEFAULT_SETTINGS = {
  perMobileDailyLimit: 20,
  perMobileHourlyLimit: 2,
  antiBotEnabled: false,
  minDelayMs: 5000,
  maxDelayMs: 15000,
  typingSimulation: true,
  typingDurationMs: 3000,
  shuffleRecipients: true,
  longPauseEnabled: true,
  longPauseChance: 0.1,
  longPauseMinMs: 30000,
  longPauseMaxMs: 120000,
  // Phase 2
  messageSpinning: true,
  businessHoursEnabled: false,
  businessHoursStart: 9,
  businessHoursEnd: 21,
  warmUpEnabled: false,
  warmUpDays: 14,
  warmUpStartLimit: 3,
  readReceiptsBeforeSend: true,
};

function formatBulkInsertError(error) {
  const entries = Array.isArray(error?.details?.errors) ? error.details.errors : [];
  if (!entries.length) return error?.message || "Bulk insert failed.";

  const preview = entries.slice(0, 12).map((entry) => {
    const row = Number.isInteger(entry?.index) ? entry.index + 1 : "?";
    const fieldPrefix = entry?.field ? `${entry.field}: ` : "";
    return `Row ${row}: ${fieldPrefix}${entry?.message || "Invalid data."}`;
  });
  const omitted = entries.length - preview.length;
  if (omitted > 0) {
    preview.push(`...and ${omitted} more errors.`);
  }

  return `Bulk insert validation failed.\n${preview.join("\n")}`;
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultCampaignDates() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    dateFrom: formatDateInputValue(today),
    dateTo: formatDateInputValue(tomorrow),
  };
}

export function useWhatsAppManager() {
  const [token, setToken] = useState("session");
  const [profile, setProfile] = useState(null);

  const [accounts, setAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [contactCategories, setContactCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [allMessages, setAllMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [activeConversationNumber, setActiveConversationNumber] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState([]);

  const [booting, setBooting] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [allMessagesLoading, setAllMessagesLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationMessagesLoading, setConversationMessagesLoading] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);
  const [dailyDrafts, setDailyDrafts] = useState({});

  const [authMode, setAuthMode] = useState("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", mobileNumber: "", password: "" });

  const [accountForm, setAccountForm] = useState({ phoneNumber: "", dailyLimit: "" });
  const [templateForm, setTemplateForm] = useState({
    name: "",
    body: "",
    mediaData: "",
    mediaFileName: "",
    mediaMimeType: "",
    mediaType: "",
  });
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    templateId: "",
    messageBody: "",
    recipientsText: "",
    maxMessages: "",
    perRecipientMessageLimit: "1",
    ...getDefaultCampaignDates(),
  });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [inboxFilter, setInboxFilter] = useState("replied");
  const [showOnlyDatabaseContacts, setShowOnlyDatabaseContacts] = useState(true);

  const stats = useMemo(() => {
    const authenticated = accounts.filter((a) => a.status === "authenticated").length;
    const running = campaigns.filter((c) => c.status === "running").length;
    const totalSent = campaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0);
    const totalFailed = campaigns.reduce((sum, c) => sum + (c.failedCount || 0), 0);
    const totalRecipients = campaigns.reduce((sum, c) => sum + (c.totalRecipients || 0), 0);

    return {
      accounts: accounts.length,
      templates: templates.length,
      campaigns: campaigns.length,
      authenticated,
      running,
      totalSent,
      totalFailed,
      totalRecipients,
      allMessages: allMessages.length,
    };
  }, [accounts, templates, campaigns, allMessages]);

  const recipientsTotal = useMemo(
    () => countRecipients(campaignForm.recipientsText),
    [campaignForm.recipientsText],
  );

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      setDashboardLoading(false);
      setRefreshing(false);
      setProfile(null);
      setAccounts([]);
      setTemplates([]);
      setContactCategories([]);
      setContacts([]);
      setCampaigns([]);
      setAllMessages([]);
      setConversations([]);
      setConversationMessages([]);
      setActiveConversationNumber("");
      setSelectedCampaign(null);
      setMessages([]);
      setSettings(DEFAULT_SETTINGS);
      return undefined;
    }

    let cancelled = false;
    const onUnauthorized = () => {
      if (!cancelled) {
        setToken("");
        if (!booting) {
          setNotice({ type: "error", text: "Session expired. Please login again." });
        }
      }
    };

    async function loadProfile(activeToken) {
      try {
        const payload = await getMe(activeToken, onUnauthorized);
        if (!cancelled) setProfile(payload);
      } catch (error) {
        if (!cancelled && error.message !== "Unauthorized.") {
          setNotice({ type: "error", text: error.message });
        }
      }
    }

    async function loadDashboard(activeToken, { silent = false } = {}) {
      if (!cancelled) {
        if (silent) setRefreshing(true);
        else setDashboardLoading(true);
      }
      try {
        const [a, t, bc, b, c, s] = await Promise.all([
          listAccounts(activeToken, onUnauthorized),
          listTemplates(activeToken, onUnauthorized),
          listContactCategories(activeToken, onUnauthorized),
          listContacts(activeToken, onUnauthorized),
          listCampaigns(activeToken, onUnauthorized),
          getSettingsApi(activeToken, onUnauthorized),
        ]);

        if (!cancelled) {
          setAccounts(a.accounts || []);
          setTemplates(t.templates || []);
          setContactCategories(bc.categories || []);
          setContacts(b.contacts || []);
          setCampaigns(c.campaigns || []);
          setSettings(s.settings || DEFAULT_SETTINGS);
          setDailyDrafts((prev) => {
            const next = { ...prev };
            for (const account of a.accounts || []) {
              if (next[account._id] == null) {
                next[account._id] =
                  account.dailyLimit == null ? "" : String(account.dailyLimit);
              }
            }
            return next;
          });
        }
      } catch (error) {
        if (!cancelled && error.message !== "Unauthorized.") {
          setNotice({ type: "error", text: error.message });
        }
      } finally {
        if (!cancelled) {
          setDashboardLoading(false);
          setRefreshing(false);
        }
      }
    }

    Promise.all([loadProfile(token), loadDashboard(token)]).finally(() => {
      if (!cancelled) setBooting(false);
    });

    const timer = window.setInterval(() => {
      loadDashboard(token, { silent: true });
      loadProfile(token).catch(() => { });
    }, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  async function refreshAll() {
    if (!token) return;
    setRefreshing(true);
    const onUnauthorized = () => {
      setToken("");
      setNotice({ type: "error", text: "Session expired. Please login again." });
    };
    try {
      const [profilePayload, a, t, bc, b, c, s] = await Promise.all([
        getMe(token, onUnauthorized),
        listAccounts(token, onUnauthorized),
        listTemplates(token, onUnauthorized),
        listContactCategories(token, onUnauthorized),
        listContacts(token, onUnauthorized),
        listCampaigns(token, onUnauthorized),
        getSettingsApi(token, onUnauthorized),
      ]);
      setProfile(profilePayload);
      setAccounts(a.accounts || []);
      setDailyDrafts((prev) => {
        const next = { ...prev };
        for (const account of a.accounts || []) {
          if (next[account._id] == null) {
            next[account._id] =
              account.dailyLimit == null ? "" : String(account.dailyLimit);
          }
        }
        return next;
      });
      setTemplates(t.templates || []);
      setContactCategories(bc.categories || []);
      setContacts(b.contacts || []);
      setCampaigns(c.campaigns || []);
      setSettings(s.settings || DEFAULT_SETTINGS);
    } catch (error) {
      if (error.message !== "Unauthorized.") {
        setNotice({ type: "error", text: error.message });
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!token) return undefined;

    let socket = null;
    let stopped = false;
    let reconnectTimer = null;

    const connect = () => {
      if (stopped) return;

      socket = new window.WebSocket(REPLIES_WS_URL);

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || "{}");
          if (payload?.type === "session:status") {
            const { accountId, status, phoneNumber, qrCodeDataUrl, lastError } = payload;
            
            setAccounts((prev) =>
              prev.map((acc) =>
                acc._id === accountId
                  ? {
                      ...acc,
                      status,
                      phoneNumber: phoneNumber !== undefined ? phoneNumber : acc.phoneNumber,
                      qrCodeDataUrl: qrCodeDataUrl !== undefined ? qrCodeDataUrl : acc.qrCodeDataUrl,
                      lastError: lastError !== undefined ? lastError : acc.lastError,
                      lastConnectedAt: status === "authenticated" ? new Date().toISOString() : acc.lastConnectedAt,
                    }
                  : acc,
              ),
            );

            setQrPreview((prev) => {
              if (prev?.accountId === accountId) {
                if (status === "authenticated") return null;
                return {
                  ...prev,
                  status,
                  qrCodeDataUrl: qrCodeDataUrl !== undefined ? qrCodeDataUrl : prev.qrCodeDataUrl,
                };
              }
              return prev;
            });
          }
        } catch (_error) {
          // Ignore
        }
      };

      socket.onclose = () => {
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };

      socket.onerror = () => {
        try { socket.close(); } catch (_e) { }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (socket) {
        try { socket.close(); } catch (_e) { }
      }
    };
  }, [token]);

  async function logout() {
    try {
      await logoutApi();
    } catch {
      // Session may already be missing/expired; keep local logout behavior.
    } finally {
      setToken("");
      setNotice({ type: "success", text: "Logged out." });
    }
  }

  async function submitAuth(e, overrideForm = null) {
    if (e && e.preventDefault) e.preventDefault();
    setAuthBusy(true);
    const formToUse = overrideForm || authForm;
    // Admin login always uses login mode
    const modeToUse = overrideForm ? "login" : authMode;

    try {
      const payload =
        modeToUse === "login"
          ? await login({
            mobileNumber: formToUse.mobileNumber.trim(),
            password: formToUse.password,
          })
          : await register({
            name: formToUse.name.trim(),
            mobileNumber: formToUse.mobileNumber.trim(),
            password: formToUse.password,
          });

      setToken("session");
      setProfile({ user: payload.user, stats: payload.stats });
      setAuthForm({ name: "", mobileNumber: "", password: "" });
      setNotice({
        type: "success",
        text: authMode === "login" ? "Login successful." : "Registration successful.",
      });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setAuthBusy(false);
    }
  }

  async function createAccount(e) {
    e.preventDefault();

    const cleanedPhone = accountForm.phoneNumber.trim().replace(/[^\d+]/g, "");
    const existingAccount = accounts.find(
      (acc) => acc.phoneNumber && acc.phoneNumber.replace(/[^\d+]/g, "") === cleanedPhone,
    );
    if (existingAccount) {
      setNotice({
        type: "error",
        text: `A session already exists for this number: ${existingAccount.name}`,
      });
      return;
    }

    setBusy("create-account");
    try {
      const dailyLimitRaw = String(accountForm.dailyLimit ?? "").trim();
      const createPayload = {
        name: "",
        phoneNumber: accountForm.phoneNumber.trim(),
      };
      if (dailyLimitRaw) {
        createPayload.dailyLimit = Number(dailyLimitRaw);
      }

      const payload = await createAccountApi(token, createPayload);

      setAccountForm({
        phoneNumber: "",
        dailyLimit: "",
      });
      await refreshAll();
      setNotice({ type: "success", text: "Session created. Scan QR to authenticate." });

      if (payload.account?._id) {
        const qr = await getAccountQr(token, payload.account._id);
        setQrPreview({ ...qr, accountName: payload.account.name });
      }
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function accountAction(accountId, action, silent = false) {
    setBusy(`${action}-${accountId}`);
    try {
      if (action === "start") await startAccount(token, accountId);
      else await stopAccount(token, accountId);

      if (!silent) {
        setNotice({ type: "success", text: action === "start" ? "Session started." : "Session stopped." });
      }
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function updateDailyLimit(accountId) {
    setBusy(`limit-${accountId}`);
    try {
      const rawValue = String(dailyDrafts[accountId] ?? "").trim();
      const payloadLimit = rawValue ? Number(rawValue) : null;
      if (rawValue && !Number.isFinite(payloadLimit)) {
        setNotice({ type: "error", text: "Daily limit must be a valid number." });
        return;
      }
      await updateAccountDailyLimit(token, accountId, payloadLimit);
      setNotice({
        type: "success",
        text: payloadLimit == null ? "Session override cleared. Settings limit will apply." : "Daily limit updated.",
      });
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function saveSettings(payload) {
    setBusy("save-settings");
    try {
      const response = await updateSettingsApi(token, payload);
      setSettings(response.settings || DEFAULT_SETTINGS);
      setNotice({ type: "success", text: "Settings saved." });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function runDataMigration() {
    setBusy("migration");
    try {
      const response = await migrateNumbersApi(token);
      setNotice({ 
        type: "success", 
        text: `Migration complete! Updated ${response.counts.contacts} contacts, ${response.counts.campaignMessages} campaigns, and ${response.counts.replyMessages} replies.` 
      });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function showQr(account) {
    setBusy(`qr-${account._id}`);
    try {
      const payload = await getAccountQr(token, account._id);
      setQrPreview({ ...payload, accountName: account.name });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function refreshQrPreview() {
    if (!qrPreview?.accountId) return;
    try {
      const qr = await getAccountQr(token, qrPreview.accountId);
      setQrPreview((prev) => ({ ...prev, ...qr }));
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    }
  }

  async function removeAccount(account) {
    const yes = window.confirm(`Delete account "${account.name}"? This also removes campaign messages.`);
    if (!yes) return;

    setBusy(`delete-${account._id}`);
    try {
      await deleteAccountApi(token, account._id);
      if (qrPreview?.accountId === account._id) setQrPreview(null);
      setSelectedCampaign(null);
      setMessages([]);
      setNotice({ type: "success", text: "Account deleted." });
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function listAccountGroups(accountId) {
    try {
      return await listAccountGroupsApi(token, accountId);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      throw error;
    }
  }

  async function findGroupsByNumber(accountId, mobileNumber) {
    try {
      return await findAccountGroupsByNumberApi(token, accountId, mobileNumber);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      throw error;
    }
  }

  async function getGroupParticipants(accountId, groupId) {
    try {
      return await getAccountGroupParticipantsApi(token, accountId, groupId);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      throw error;
    }
  }

  async function createTemplate(e) {
    e.preventDefault();
    setBusy("create-template");
    try {
      await createTemplateApi(token, {
        name: templateForm.name.trim(),
        body: templateForm.body.trim(),
        mediaData: templateForm.mediaData || undefined,
        mediaFileName: templateForm.mediaFileName || undefined,
      });
      setTemplateForm({
        name: "",
        body: "",
        mediaData: "",
        mediaFileName: "",
        mediaMimeType: "",
        mediaType: "",
      });
      setNotice({ type: "success", text: "Template created." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createCampaign(e, overridePayload = null) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();

    const formToUse = overridePayload || campaignForm;
    const eligibleAccountIds = accounts
      .filter((account) => account.isActive !== false && account.status === "authenticated")
      .map((account) => account._id);

    if (!eligibleAccountIds.length) {
      setNotice({ type: "error", text: "No active authenticated sessions available for sending." });
      return false;
    }
    if (!formToUse.maxMessages) {
      setNotice({ type: "error", text: "Total messages to send is required." });
      return false;
    }
    let finalMessageBody = "";
    if (formToUse.templateId) {
      const selectedTemplate = templates.find((t) => t._id === formToUse.templateId);
      if (!selectedTemplate) {
        setNotice({ type: "error", text: "Selected template is invalid." });
        return false;
      }
      finalMessageBody = selectedTemplate.body || "";
    } else {
      finalMessageBody = formToUse.messageBody || "";
    }

    if (!finalMessageBody && !formToUse.mediaData) {
      setNotice({ type: "error", text: "Please provide a message or media." });
      return false;
    }

    if (formToUse.dateFrom && formToUse.dateTo && formToUse.dateFrom > formToUse.dateTo) {
      setNotice({ type: "error", text: "Campaign From date cannot be later than Campaign To date." });
      return false;
    }
    setBusy("create-campaign");
    try {
      // Use user-selected sessions; fall back to all eligible if none chosen
      const chosenIds =
        Array.isArray(formToUse.accountIds) && formToUse.accountIds.length
          ? formToUse.accountIds
          : eligibleAccountIds;

      await createCampaignApi(token, {
        title: (formToUse.title || "").trim(),
        accountIds: chosenIds,
        templateId: formToUse.templateId || null,
        messageBody: finalMessageBody,
        recipientsText: formToUse.recipientsText,
        maxMessages: Number(formToUse.maxMessages),
        perRecipientMessageLimit: Number(formToUse.perRecipientMessageLimit || 1),
        dateFrom: formToUse.dateFrom || undefined,
        dateTo: formToUse.dateTo || undefined,
        mediaData: formToUse.mediaData || null,
        mediaType: formToUse.mediaType || null,
        mediaMimeType: formToUse.mediaMimeType || null,
        mediaFileName: formToUse.mediaFileName || null,
      });
      if (!overridePayload) {
        setCampaignForm((prev) => ({
          ...prev,
          title: "",
          recipientsText: "",
          maxMessages: "",
          perRecipientMessageLimit: "1",
          ...getDefaultCampaignDates(),
        }));
      }
      setNotice({ type: "success", text: "Campaign queued." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function campaignAction(campaignId, action) {
    setBusy(`${action}-${campaignId}`);
    try {
      if (action === "pause") await pauseCampaign(token, campaignId);
      else await resumeCampaign(token, campaignId);

      setNotice({ type: "success", text: `Campaign ${action}d.` });
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function updateCampaign(campaignId, payload) {
    if (payload.dateFrom && payload.dateTo && payload.dateFrom > payload.dateTo) {
      setNotice({ type: "error", text: "Campaign From date cannot be later than Campaign To date." });
      return false;
    }

    setBusy(`update-${campaignId}`);
    try {
      await updateCampaignApi(token, campaignId, payload);
      setNotice({ type: "success", text: "Campaign updated." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function loadMessages(campaign) {
    setSelectedCampaign(campaign);
    setMessagesLoading(true);
    try {
      const payload = await getCampaignMessages(token, campaign._id);
      setMessages(payload.messages || []);
    } catch (error) {
      setMessages([]);
      setNotice({ type: "error", text: error.message });
    } finally {
      setMessagesLoading(false);
    }
  }

  async function loadAllMessages() {
    setAllMessagesLoading(true);
    try {
      const combinedMessages = [];
      for (const campaign of campaigns) {
        try {
          const payload = await getCampaignMessages(token, campaign._id);
          const msgs = (payload.messages || []).map((m) => ({
            ...m,
            campaignTitle: campaign.title,
          }));
          combinedMessages.push(...msgs);
        } catch (error) {
          console.error(`Failed to load messages for campaign ${campaign._id}:`, error);
        }
      }

      combinedMessages.sort(
        (a, b) => new Date(b.sentAt || b.createdAt) - new Date(a.sentAt || a.createdAt),
      );
      setAllMessages(combinedMessages);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setAllMessagesLoading(false);
    }
  }

  async function loadConversations({
    preserveSelection = true,
    silent = false,
    preferredContactNumber = "",
  } = {}) {
    if (!token) return [];

    if (!silent) {
      setConversationsLoading(true);
    }

    try {
      const payload = await listConversationsApi(token, {
        filter: inboxFilter,
        onlyDatabaseContacts: showOnlyDatabaseContacts,
      });
      const nextConversations = payload.conversations || [];
      setConversations(nextConversations);

      const preferredSelection = String(preferredContactNumber || "").trim();
      const existingActive =
        preserveSelection &&
          (preferredSelection || activeConversationNumber) &&
          nextConversations.some(
            (item) => item.contactNumber === (preferredSelection || activeConversationNumber),
          )
          ? (preferredSelection || activeConversationNumber)
          : "";

      const nextActive = existingActive || nextConversations[0]?.contactNumber || "";
      setActiveConversationNumber(nextActive);
      if (!nextActive) {
        setConversationMessages([]);
      }

      return nextConversations;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return [];
    } finally {
      if (!silent) {
        setConversationsLoading(false);
      }
    }
  }

  async function openConversation(contactNumber, { markRead = true, silent = false } = {}) {
    if (!token || !contactNumber) return [];

    setActiveConversationNumber(contactNumber);
    if (!silent) {
      setConversationMessagesLoading(true);
    }
    try {
      const payload = await getConversationMessagesApi(token, contactNumber);
      const nextMessages = payload.messages || [];
      setConversationMessages(nextMessages);

      if (markRead) {
        await markConversationReadApi(token, contactNumber).catch(() => { });
        await loadConversations({
          preserveSelection: true,
          silent: true,
          preferredContactNumber: contactNumber,
        });
      }

      return nextMessages;
    } catch (error) {
      setConversationMessages([]);
      setNotice({ type: "error", text: error.message });
      return [];
    } finally {
      if (!silent) {
        setConversationMessagesLoading(false);
      }
    }
  }

  async function openInbox() {
    const list = await loadConversations({ preserveSelection: true });
    const target = activeConversationNumber || list[0]?.contactNumber || "";
    if (target) {
      await openConversation(target, { markRead: true });
    }
  }

  async function sendReplyToActiveConversation(text, accountId = "") {
    const contactNumber = activeConversationNumber;
    const payloadText = String(text || "").trim();
    if (!contactNumber) {
      setNotice({ type: "error", text: "Select a conversation first." });
      return false;
    }
    if (!payloadText) {
      setNotice({ type: "error", text: "Reply message cannot be empty." });
      return false;
    }

    setSendingReply(true);
    try {
      const requestPayload = {
        text: payloadText,
      };
      if (accountId) {
        requestPayload.accountId = accountId;
      }

      await sendConversationReplyApi(token, contactNumber, requestPayload);
      await openConversation(contactNumber, { markRead: false });
      await loadConversations({
        preserveSelection: true,
        silent: true,
        preferredContactNumber: contactNumber,
      });
      setNotice({ type: "success", text: "Reply sent." });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setSendingReply(false);
    }
  }

  async function clearAllChats() {
    const yes = window.confirm("Are you sure you want to PERMANENTLY delete ALL manual message history? Campaign reports will be kept but the inbox will be cleared.");
    if (!yes) return;

    setBusy("clear-all");
    try {
      await clearAllChatsApi(token);
      setNotice({ type: "success", text: "Inbox cleared." });
      await loadConversations({ silent: true });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function clearUnrepliedChats() {
    const yes = window.confirm("Permanently delete all chats where you haven't replied yet?");
    if (!yes) return;

    setBusy("clear-unreplied");
    try {
      await clearUnrepliedChatsApi(token);
      setNotice({ type: "success", text: "Unreplied chats cleared." });
      await loadConversations({ silent: true });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function updateTemplate(templateId, payload) {
    setBusy(`update-template-${templateId}`);
    try {
      await updateTemplateApi(token, templateId, payload);
      setNotice({ type: "success", text: "Template updated." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function deleteConversation(contactNumber) {
    const yes = window.confirm(`Delete chat with "${contactNumber}"? This will remove all messages in this conversation.`);
    if (!yes) return false;

    setBusy(`delete-conversation-${contactNumber}`);
    try {
      await deleteConversationApi(token, contactNumber);
      setNotice({ type: "success", text: "Chat deleted." });
      
      if (activeConversationNumber === contactNumber) {
        setActiveConversationNumber("");
        setConversationMessages([]);
      }
      
      await loadConversations({ preserveSelection: false });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function deleteCampaign(campaign) {
    const yes = window.confirm(`Delete campaign "${campaign.title}"? This will also remove all its messages.`);
    if (!yes) return;

    setBusy(`delete-campaign-${campaign._id}`);
    try {
      await deleteCampaignApi(token, campaign._id);
      if (selectedCampaign?._id === campaign._id) {
        setSelectedCampaign(null);
        setMessages([]);
      }
      setNotice({ type: "success", text: "Campaign deleted." });
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function deleteTemplate(template) {
    const yes = window.confirm(`Delete template "${template.name}"?`);
    if (!yes) return;

    setBusy(`delete-template-${template._id}`);
    try {
      await deleteTemplateApi(token, template._id);
      setNotice({ type: "success", text: "Template deleted." });
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function createContactCategory(payload) {
    setBusy("create-contact-category");
    try {
      await createContactCategoryApi(token, payload);
      setNotice({ type: "success", text: "Contact category created." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function deleteContactCategory(category) {
    const yes = window.confirm(`Delete category "${category.name}"?`);
    if (!yes) return false;

    setBusy(`delete-contact-category-${category._id}`);
    try {
      await deleteContactCategoryApi(token, category._id);
      setNotice({ type: "success", text: "Contact category deleted." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function updateContactCategory(categoryId, payload) {
    setBusy(`update-contact-category-${categoryId}`);
    try {
      await updateContactCategoryApi(token, categoryId, payload);
      setNotice({ type: "success", text: "Contact category updated." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createContact(payload) {
    setBusy("create-contact");
    try {
      await createContactApi(token, payload);
      setNotice({ type: "success", text: "Contact saved." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function bulkInsertContacts(payload) {
    setBusy("bulk-contact-json");
    try {
      const response = await bulkInsertContactsApi(token, payload);
      setNotice({
        type: "success",
        text: `${response.insertedCount || 0} contact records inserted.`,
      });
      await refreshAll();
      return response;
    } catch (error) {
      const detailedMessage = formatBulkInsertError(error);
      setNotice({ type: "error", text: detailedMessage });
      const wrappedError = new Error(detailedMessage);
      wrappedError.details = error?.details;
      throw wrappedError;
    } finally {
      setBusy("");
    }
  }

  async function deleteContact(contact) {
    const yes = window.confirm(`Delete contact "${contact.name || contact.contactName || contact.businessName}"?`);
    if (!yes) return false;

    setBusy(`delete-contact-${contact._id}`);
    try {
      await deleteContactApi(token, contact._id);
      setNotice({ type: "success", text: "Contact deleted." });
      await refreshAll();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }


  async function loadUsers() {
    if (!token || profile?.user?.role !== "admin") return;
    setUsersLoading(true);
    try {
      const data = await listUsersApi(token, () => setToken(""));
      setUsers(data || []);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setUsersLoading(false);
    }
  }

  async function createUser(payload) {
    setBusy("create-user");
    try {
      await createUserApi(token, payload, () => setToken(""));
      setNotice({ type: "success", text: "User created successfully." });
      await loadUsers();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function resetUserPassword(userId, newPassword) {
    setBusy(`reset-password-${userId}`);
    try {
      await resetPasswordApi(token, userId, newPassword, () => setToken(""));
      setNotice({ type: "success", text: "Password reset successful." });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function toggleUser(userId) {
    setBusy(`toggle-user-${userId}`);
    try {
      await toggleUserStatusApi(token, userId, () => setToken(""));
      await loadUsers();
      setNotice({ type: "success", text: "User status updated." });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function updateUser(userId, payload) {
    setBusy(`update-user-${userId}`);
    try {
      await updateUserApi(token, userId, payload, () => setToken(""));
      await loadUsers();
      setNotice({ type: "success", text: "User updated successfully." });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function deleteUser(userId) {
    const yes = window.confirm("Are you sure you want to delete this user?");
    if (!yes) return false;
    setBusy(`delete-user-${userId}`);
    try {
      await deleteUserApi(token, userId, () => setToken(""));
      await loadUsers();
      setNotice({ type: "success", text: "User deleted successfully." });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function loadSecurityAlerts() {
    try {
      const payload = await adminApi.getSecurityAlerts(token, () => setToken(""));
      if (payload) {
        setSecurityAlerts(payload);
      }
    } catch (e) {
      console.error("Failed to load security alerts", e);
    }
  }

  return {
    token,
    profile,
    accounts,
    templates,
    contactCategories,
    contacts,
    campaigns,
    allMessages,
    conversations,
    conversationMessages,
    activeConversationNumber,
    selectedCampaign,
    messages,
    users,
    usersLoading,
    securityAlerts,
    booting,
    dashboardLoading,
    messagesLoading,
    allMessagesLoading,
    conversationsLoading,
    conversationMessagesLoading,
    sendingReply,
    refreshing,
    busy,
    notice,
    qrPreview,
    dailyDrafts,
    authMode,
    authBusy,
    authForm,
    accountForm,
    templateForm,
    campaignForm,
    settings,
    stats,
    recipientsTotal,
    inboxFilter,
    showOnlyDatabaseContacts,

    setNotice,
    setDailyDrafts,
    setAuthMode,
    setAuthForm,
    setAccountForm,
    setTemplateForm,
    setCampaignForm,
    setQrPreview,
    setInboxFilter,
    setShowOnlyDatabaseContacts,

    refreshAll,
    logout,
    submitAuth,
    createAccount,
    accountAction,
    updateDailyLimit,
    saveSettings,
    showQr,
    refreshQrPreview,
    removeAccount,
    listAccountGroups,
    findGroupsByNumber,
    getGroupParticipants,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createContactCategory,
    updateContactCategory,
    deleteContactCategory,
    createContact,
    bulkInsertContacts,
    deleteContact,
    createCampaign,
    deleteCampaign,
    updateCampaign,
    campaignAction,
    loadMessages,
    loadAllMessages,
    loadConversations,
    openConversation,
    openInbox,
    sendReplyToActiveConversation,
    deleteConversation,
    clearAllChats,
    clearUnrepliedChats,
    runDataMigration,
    loadUsers,
    createUser,
    resetUserPassword,
    toggleUser,
    updateUser,
    deleteUser,
    loadSecurityAlerts,
  };
}
