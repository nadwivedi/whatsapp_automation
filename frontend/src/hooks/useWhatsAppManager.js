import { useEffect, useMemo, useState } from "react";
import { TOKEN_KEY } from "../api/client";
import { getMe, login, register } from "../api/authApi";
import {
  createAccount as createAccountApi,
  deleteAccount as deleteAccountApi,
  getAccountQr,
  listAccounts,
  startAccount,
  stopAccount,
  updateAccountDailyLimit,
} from "../api/accountsApi";
import { createTemplate as createTemplateApi, listTemplates } from "../api/templatesApi";
import {
  createCampaign as createCampaignApi,
  getCampaignMessages,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  updateCampaign as updateCampaignApi,
} from "../api/campaignsApi";
import {
  getSettings as getSettingsApi,
  updateSettings as updateSettingsApi,
} from "../api/settingsApi";
import { countRecipients } from "../utils/formatters";

const DEFAULT_SETTINGS = {
  perMobileDailyLimit: 20,
  perMobileHourlyLimit: 2,
};

export function useWhatsAppManager() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [profile, setProfile] = useState(null);

  const [accounts, setAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [allMessages, setAllMessages] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [messages, setMessages] = useState([]);

  const [booting, setBooting] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [allMessagesLoading, setAllMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);
  const [dailyDrafts, setDailyDrafts] = useState({});

  const [authMode, setAuthMode] = useState("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", mobileNumber: "", password: "" });

  const [accountForm, setAccountForm] = useState({ phoneNumber: "", dailyLimit: 20 });
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
    dailyMessageLimit: "",
    perRecipientMessageLimit: "1",
    dateFrom: "",
    dateTo: "",
  });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

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
    const daily = String(settings.perMobileDailyLimit || DEFAULT_SETTINGS.perMobileDailyLimit);
    setAccountForm((prev) => (prev.phoneNumber ? prev : { ...prev, dailyLimit: daily }));
  }, [settings.perMobileDailyLimit]);

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
      setCampaigns([]);
      setAllMessages([]);
      setSelectedCampaign(null);
      setMessages([]);
      setSettings(DEFAULT_SETTINGS);
      return undefined;
    }

    let cancelled = false;
    const onUnauthorized = () => {
      localStorage.removeItem(TOKEN_KEY);
      if (!cancelled) {
        setToken("");
        setNotice({ type: "error", text: "Session expired. Please login again." });
      }
    };

    async function loadProfile(activeToken) {
      const payload = await getMe(activeToken, onUnauthorized);
      if (!cancelled) setProfile(payload);
    }

    async function loadDashboard(activeToken, { silent = false } = {}) {
      if (!cancelled) {
        if (silent) setRefreshing(true);
        else setDashboardLoading(true);
      }
      try {
        const [a, t, c, s] = await Promise.all([
          listAccounts(activeToken, onUnauthorized),
          listTemplates(activeToken, onUnauthorized),
          listCampaigns(activeToken, onUnauthorized),
          getSettingsApi(activeToken, onUnauthorized),
        ]);

        if (!cancelled) {
          setAccounts(a.accounts || []);
          setTemplates(t.templates || []);
          setCampaigns(c.campaigns || []);
          setSettings(s.settings || DEFAULT_SETTINGS);
          setDailyDrafts((prev) => {
            const next = { ...prev };
            for (const account of a.accounts || []) {
              if (next[account._id] == null) next[account._id] = account.dailyLimit;
            }
            return next;
          });
        }
      } catch (error) {
        if (!cancelled) setNotice({ type: "error", text: error.message });
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
      loadProfile(token).catch(() => {});
    }, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  async function refreshAll() {
    if (!token) return;
    setRefreshing(true);
    try {
      const [profilePayload, a, t, c, s] = await Promise.all([
        getMe(token),
        listAccounts(token),
        listTemplates(token),
        listCampaigns(token),
        getSettingsApi(token),
      ]);
      setProfile(profilePayload);
      setAccounts(a.accounts || []);
      setTemplates(t.templates || []);
      setCampaigns(c.campaigns || []);
      setSettings(s.settings || DEFAULT_SETTINGS);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setRefreshing(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setNotice({ type: "success", text: "Logged out." });
  }

  async function submitAuth(e) {
    e.preventDefault();
    setAuthBusy(true);
    try {
      const payload =
        authMode === "login"
          ? await login({
              mobileNumber: authForm.mobileNumber.trim(),
              password: authForm.password,
            })
          : await register({
              name: authForm.name.trim(),
              mobileNumber: authForm.mobileNumber.trim(),
              password: authForm.password,
            });

      localStorage.setItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
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
      const payload = await createAccountApi(token, {
        name: "",
        phoneNumber: accountForm.phoneNumber.trim(),
        dailyLimit: Number(accountForm.dailyLimit),
      });

      setAccountForm({
        phoneNumber: "",
        dailyLimit: settings.perMobileDailyLimit || DEFAULT_SETTINGS.perMobileDailyLimit,
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

  async function accountAction(accountId, action) {
    setBusy(`${action}-${accountId}`);
    try {
      if (action === "start") await startAccount(token, accountId);
      else await stopAccount(token, accountId);

      setNotice({ type: "success", text: action === "start" ? "Session started." : "Session stopped." });
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
      await updateAccountDailyLimit(token, accountId, Number(dailyDrafts[accountId]));
      setNotice({ type: "success", text: "Daily limit updated." });
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
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function createCampaign(e) {
    e.preventDefault();
    const eligibleAccountIds = accounts
      .filter((account) => account.isActive !== false && account.status === "authenticated")
      .map((account) => account._id);

    if (!eligibleAccountIds.length) {
      setNotice({ type: "error", text: "No active authenticated sessions available for sending." });
      return;
    }
    if (!campaignForm.maxMessages) {
      setNotice({ type: "error", text: "Total messages to send is required." });
      return;
    }
    if (!campaignForm.templateId) {
      setNotice({ type: "error", text: "Please select a message template." });
      return;
    }
    const selectedTemplate = templates.find((t) => t._id === campaignForm.templateId);
    if (!selectedTemplate) {
      setNotice({ type: "error", text: "Selected template is invalid." });
      return;
    }
    if (campaignForm.dateFrom && campaignForm.dateTo && campaignForm.dateFrom > campaignForm.dateTo) {
      setNotice({ type: "error", text: "Campaign From date cannot be later than Campaign To date." });
      return;
    }
    setBusy("create-campaign");
    try {
      await createCampaignApi(token, {
        title: campaignForm.title.trim(),
        accountIds: eligibleAccountIds,
        templateId: campaignForm.templateId,
        messageBody: selectedTemplate.body || "",
        recipientsText: campaignForm.recipientsText,
        maxMessages: Number(campaignForm.maxMessages),
        dailyMessageLimit: campaignForm.dailyMessageLimit
          ? Number(campaignForm.dailyMessageLimit)
          : undefined,
        perRecipientMessageLimit: Number(campaignForm.perRecipientMessageLimit || 1),
        dateFrom: campaignForm.dateFrom || undefined,
        dateTo: campaignForm.dateTo || undefined,
      });
      setCampaignForm((prev) => ({
        ...prev,
        title: "",
        recipientsText: "",
        maxMessages: "",
        dailyMessageLimit: "",
        perRecipientMessageLimit: "1",
        dateFrom: "",
        dateTo: "",
      }));
      setNotice({ type: "success", text: "Campaign queued." });
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
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

  return {
    token,
    profile,
    accounts,
    templates,
    campaigns,
    allMessages,
    selectedCampaign,
    messages,
    booting,
    dashboardLoading,
    messagesLoading,
    allMessagesLoading,
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

    setNotice,
    setDailyDrafts,
    setAuthMode,
    setAuthForm,
    setAccountForm,
    setTemplateForm,
    setCampaignForm,
    setQrPreview,

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
    createTemplate,
    createCampaign,
    updateCampaign,
    campaignAction,
    loadMessages,
    loadAllMessages,
  };
}
