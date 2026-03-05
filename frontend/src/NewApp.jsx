import { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const TOKEN_KEY = "wa_auth_token";

const accountTone = {
  new: "bg-slate-100 text-slate-700",
  initializing: "bg-amber-100 text-amber-700",
  qr_ready: "bg-cyan-100 text-cyan-700",
  authenticated: "bg-emerald-100 text-emerald-700",
  disconnected: "bg-orange-100 text-orange-700",
  auth_failure: "bg-rose-100 text-rose-700",
};

const campaignTone = {
  queued: "bg-sky-100 text-sky-700",
  running: "bg-amber-100 text-amber-700",
  paused: "bg-slate-100 text-slate-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
};

async function apiRequest(path, { token = "", options = {}, onUnauthorized } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  return {
    date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

function countRecipients(input) {
  return input
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean).length;
}

function NewApp() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [profile, setProfile] = useState(null);
  const [currentPage, setCurrentPage] = useState("dashboard");

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

  const [accountForm, setAccountForm] = useState({ name: "", phoneNumber: "", dailyLimit: 20 });
  const [templateForm, setTemplateForm] = useState({ name: "", body: "" });
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    accountId: "",
    templateId: "",
    messageBody: "",
    recipientsText: "",
  });

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
      setCampaigns([]);
      setAllMessages([]);
      setSelectedCampaign(null);
      setMessages([]);
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
      const payload = await apiRequest("/auth/me", { token: activeToken, onUnauthorized });
      if (!cancelled) setProfile(payload);
    }

    async function loadDashboard(activeToken, { silent = false } = {}) {
      if (!cancelled) {
        if (silent) setRefreshing(true);
        else setDashboardLoading(true);
      }
      try {
        const [a, t, c] = await Promise.all([
          apiRequest("/accounts", { token: activeToken, onUnauthorized }),
          apiRequest("/templates", { token: activeToken, onUnauthorized }),
          apiRequest("/campaigns", { token: activeToken, onUnauthorized }),
        ]);
        if (!cancelled) {
          setAccounts(a.accounts || []);
          setTemplates(t.templates || []);
          setCampaigns(c.campaigns || []);
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

  async function loadAllMessages() {
    setAllMessagesLoading(true);
    try {
      const combinedMessages = [];
      for (const campaign of campaigns) {
        try {
          const payload = await apiRequest(`/campaigns/${campaign._id}/messages`, { token });
          const msgs = (payload.messages || []).map((m) => ({
            ...m,
            campaignTitle: campaign.title,
          }));
          combinedMessages.push(...msgs);
        } catch (e) {
          console.error(`Failed to load messages for campaign ${campaign._id}:`, e);
        }
      }
      combinedMessages.sort((a, b) => new Date(b.sentAt || b.createdAt) - new Date(a.sentAt || a.createdAt));
      setAllMessages(combinedMessages);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setAllMessagesLoading(false);
    }
  }

  async function refreshAll() {
    if (!token) return;
    setRefreshing(true);
    try {
      const [profilePayload, a, t, c] = await Promise.all([
        apiRequest("/auth/me", { token }),
        apiRequest("/accounts", { token }),
        apiRequest("/templates", { token }),
        apiRequest("/campaigns", { token }),
      ]);
      setProfile(profilePayload);
      setAccounts(a.accounts || []);
      setTemplates(t.templates || []);
      setCampaigns(c.campaigns || []);
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
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const body =
        authMode === "login"
          ? { mobileNumber: authForm.mobileNumber.trim(), password: authForm.password }
          : {
              name: authForm.name.trim(),
              mobileNumber: authForm.mobileNumber.trim(),
              password: authForm.password,
            };

      const payload = await apiRequest(endpoint, {
        options: { method: "POST", body: JSON.stringify(body) },
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
    setBusy("create-account");
    try {
      const payload = await apiRequest("/accounts", {
        token,
        options: {
          method: "POST",
          body: JSON.stringify({
            name: accountForm.name.trim(),
            phoneNumber: accountForm.phoneNumber.trim(),
            dailyLimit: Number(accountForm.dailyLimit),
          }),
        },
      });
      setAccountForm({ name: "", phoneNumber: "", dailyLimit: 20 });
      await refreshAll();
      setNotice({ type: "success", text: "Session created. Scan QR to authenticate." });
      if (payload.account?._id) {
        const qr = await apiRequest(`/accounts/${payload.account._id}/qr`, { token });
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
      await apiRequest(`/accounts/${accountId}/${action}`, {
        token,
        options: { method: "POST" },
      });
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
      await apiRequest(`/accounts/${accountId}/daily-limit`, {
        token,
        options: {
          method: "PATCH",
          body: JSON.stringify({ dailyLimit: Number(dailyDrafts[accountId]) }),
        },
      });
      setNotice({ type: "success", text: "Daily limit updated." });
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function showQr(account) {
    setBusy(`qr-${account._id}`);
    try {
      const payload = await apiRequest(`/accounts/${account._id}/qr`, { token });
      setQrPreview({ ...payload, accountName: account.name });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function deleteAccount(account) {
    const yes = window.confirm(`Delete account "${account.name}"? This also removes campaign messages.`);
    if (!yes) return;
    setBusy(`delete-${account._id}`);
    try {
      await apiRequest(`/accounts/${account._id}`, { token, options: { method: "DELETE" } });
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
      await apiRequest("/templates", {
        token,
        options: {
          method: "POST",
          body: JSON.stringify({ name: templateForm.name.trim(), body: templateForm.body.trim() }),
        },
      });
      setTemplateForm({ name: "", body: "" });
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
    setBusy("create-campaign");
    try {
      await apiRequest("/campaigns", {
        token,
        options: {
          method: "POST",
          body: JSON.stringify({
            title: campaignForm.title.trim(),
            accountId: campaignForm.accountId,
            templateId: campaignForm.templateId || undefined,
            messageBody: campaignForm.messageBody,
            recipientsText: campaignForm.recipientsText,
          }),
        },
      });
      setCampaignForm((prev) => ({ ...prev, title: "", recipientsText: "" }));
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
      await apiRequest(`/campaigns/${campaignId}/${action}`, {
        token,
        options: { method: "POST" },
      });
      setNotice({ type: "success", text: `Campaign ${action}d.` });
      await refreshAll();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function loadMessages(campaign) {
    setSelectedCampaign(campaign);
    setMessagesLoading(true);
    try {
      const payload = await apiRequest(`/campaigns/${campaign._id}/messages`, { token });
      setMessages(payload.messages || []);
    } catch (error) {
      setMessages([]);
      setNotice({ type: "error", text: error.message });
    } finally {
      setMessagesLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="grid min-h-screen place-items-center px-4 py-10">
        <div className="glass-panel w-full max-w-xl rounded-3xl p-8">
          <p className="font-heading text-sm uppercase tracking-[0.22em] text-slate-500">WhatsApp System</p>
          <h1 className="font-heading mt-2 text-3xl text-slate-900">{authMode === "login" ? "Login" : "Create Account"}</h1>
          <form className="mt-5 space-y-3" onSubmit={submitAuth}>
            {authMode === "register" && (
              <input className="input" placeholder="Full name" value={authForm.name} onChange={(e) => setAuthForm((p) => ({ ...p, name: e.target.value }))} required />
            )}
            <input className="input" placeholder="Mobile number" value={authForm.mobileNumber} onChange={(e) => setAuthForm((p) => ({ ...p, mobileNumber: e.target.value }))} required />
            <input className="input" type="password" placeholder="Password" value={authForm.password} onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))} required />
            <button className="btn-cyan w-full" disabled={authBusy}>{authBusy ? "Please wait..." : authMode === "login" ? "Login" : "Register"}</button>
          </form>
          <button type="button" className="mt-4 text-sm font-semibold text-cyan-700 hover:text-cyan-600" onClick={() => setAuthMode((p) => (p === "login" ? "register" : "login"))}>
            {authMode === "login" ? "Need an account? Register" : "Already have an account? Login"}
          </button>
          {notice && <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${notice.type === "error" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{notice.text}</div>}
        </div>
      </div>
    );
  }

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "sessions", label: "Sessions", icon: "📱" },
    { key: "templates", label: "Templates", icon: "📝" },
    { key: "campaigns", label: "Campaigns", icon: "🚀" },
    { key: "messages", label: "Messages", icon: "💬" },
  ];

  return (
    <div className="min-h-screen">
      <aside className="fixed left-0 top-0 z-50 h-screen w-64 transform bg-white/80 shadow-2xl backdrop-blur-xl transition-transform duration-300">
        <div className="flex h-full flex-col border-r border-white/50 p-5">
          <div className="mb-6">
            <p className="font-heading text-xs uppercase tracking-[0.2em] text-slate-500">WhatsApp</p>
            <h1 className="font-heading text-xl font-bold text-slate-900">Message Hub</h1>
          </div>

          <div className="mb-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 p-4 text-white">
            <p className="text-xs opacity-80">Welcome back,</p>
            <p className="font-heading text-lg font-semibold">{profile?.user?.name || "User"}</p>
            <p className="mt-1 text-xs opacity-80">{profile?.user?.mobileNumber || "--"}</p>
          </div>

          <nav className="flex-1 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setCurrentPage(item.key);
                  if (item.key === "messages") {
                    loadAllMessages();
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition-all duration-200 ${
                  currentPage === item.key
                    ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/25"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-4">
            <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 font-medium text-rose-600 transition hover:bg-rose-50">
              <span className="text-lg">🚪</span>
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="ml-64 min-h-screen px-6 py-6">
        {notice && (
          <div className={`fixed right-6 top-6 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            notice.type === "error" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
          }`}>
            {notice.text}
          </div>
        )}

        {currentPage === "dashboard" && (
          <div className="space-y-6">
            <header className="flex items-center justify-between">
              <div>
                <p className="font-heading text-sm uppercase tracking-[0.2em] text-slate-500">Overview</p>
                <h1 className="font-heading text-3xl font-bold text-slate-900">Dashboard</h1>
              </div>
              <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </header>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="glass-panel group relative overflow-hidden rounded-2xl p-6 transition-transform hover:scale-[1.02]">
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-cyan-200/50 transition-transform group-hover:scale-150"></div>
                <p className="relative text-xs uppercase tracking-wider text-slate-500">Total Accounts</p>
                <p className="relative font-heading text-4xl font-bold text-slate-900">{stats.accounts}</p>
                <p className="relative mt-1 text-sm text-emerald-600">{stats.authenticated} authenticated</p>
              </div>

              <div className="glass-panel group relative overflow-hidden rounded-2xl p-6 transition-transform hover:scale-[1.02]">
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-200/50 transition-transform group-hover:scale-150"></div>
                <p className="relative text-xs uppercase tracking-wider text-slate-500">Total Campaigns</p>
                <p className="relative font-heading text-4xl font-bold text-slate-900">{stats.campaigns}</p>
                <p className="relative mt-1 text-sm text-amber-600">{stats.running} running</p>
              </div>

              <div className="glass-panel group relative overflow-hidden rounded-2xl p-6 transition-transform hover:scale-[1.02]">
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-amber-200/50 transition-transform group-hover:scale-150"></div>
                <p className="relative text-xs uppercase tracking-wider text-slate-500">Messages Sent</p>
                <p className="relative font-heading text-4xl font-bold text-slate-900">{stats.totalSent}</p>
                <p className="relative mt-1 text-sm text-rose-600">{stats.totalFailed} failed</p>
              </div>

              <div className="glass-panel group relative overflow-hidden rounded-2xl p-6 transition-transform hover:scale-[1.02]">
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-violet-200/50 transition-transform group-hover:scale-150"></div>
                <p className="relative text-xs uppercase tracking-wider text-slate-500">Templates</p>
                <p className="relative font-heading text-4xl font-bold text-slate-900">{stats.templates}</p>
                <p className="relative mt-1 text-sm text-slate-600">reusable messages</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="glass-panel rounded-2xl p-6">
                <h2 className="font-heading text-xl font-semibold text-slate-900">Recent Campaigns</h2>
                <div className="mt-4 space-y-3">
                  {campaigns.slice(0, 5).map((campaign) => {
                    const processed = campaign.sentCount + campaign.failedCount;
                    const progress = campaign.totalRecipients ? Math.min(100, Math.round((processed / campaign.totalRecipients) * 100)) : 0;
                    return (
                      <div key={campaign._id} className="rounded-xl bg-white/70 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{campaign.title}</p>
                            <p className="text-xs text-slate-500">{formatDate(campaign.createdAt)}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${campaignTone[campaign.status] || "bg-slate-100 text-slate-700"}`}>
                            {campaign.status}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-slate-600">
                          <span>Total: {campaign.totalRecipients}</span>
                          <span className="text-emerald-600">Sent: {campaign.sentCount}</span>
                          <span className="text-rose-600">Failed: {campaign.failedCount}</span>
                        </div>
                      </div>
                    );
                  })}
                  {campaigns.length === 0 && <p className="empty">No campaigns yet.</p>}
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-6">
                <h2 className="font-heading text-xl font-semibold text-slate-900">Active Sessions</h2>
                <div className="mt-4 space-y-3">
                  {accounts.slice(0, 5).map((account) => (
                    <div key={account._id} className="flex items-center justify-between rounded-xl bg-white/70 p-4">
                      <div>
                        <p className="font-medium text-slate-900">{account.name}</p>
                        <p className="text-xs text-slate-500">{account.phoneNumber || "Not linked"}</p>
                      </div>
                      <div className="text-right">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${accountTone[account.status] || "bg-slate-100 text-slate-700"}`}>
                          {account.status}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">Sent today: {account.sentToday}</p>
                      </div>
                    </div>
                  ))}
                  {accounts.length === 0 && <p className="empty">No sessions yet.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentPage === "sessions" && (
          <section className="space-y-6">
            <header className="flex items-center justify-between">
              <div>
                <p className="font-heading text-sm uppercase tracking-[0.2em] text-slate-500">Manage</p>
                <h1 className="font-heading text-3xl font-bold text-slate-900">Sessions</h1>
              </div>
              <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </header>

            <div className="glass-panel rounded-2xl p-6">
              <h2 className="font-heading text-xl font-semibold text-slate-900">Create New Session</h2>
              <p className="mt-1 text-sm text-slate-600">Create and manage WhatsApp sessions.</p>
              <form className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_130px_160px]" onSubmit={createAccount}>
                <input className="input" placeholder="Session name (optional)" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} />
                <input className="input" placeholder="Mobile number" value={accountForm.phoneNumber} onChange={(e) => setAccountForm((p) => ({ ...p, phoneNumber: e.target.value }))} required />
                <input className="input" type="number" min="1" max="500" value={accountForm.dailyLimit} onChange={(e) => setAccountForm((p) => ({ ...p, dailyLimit: e.target.value }))} required />
                <button className="btn-cyan" disabled={busy === "create-account"}>{busy === "create-account" ? "Creating..." : "Create Session"}</button>
              </form>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {accounts.map((account) => (
                <div key={account._id} className="glass-panel rounded-2xl p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-semibold text-slate-900">{account.name}</p>
                      <p className="text-sm text-slate-500">{account.phoneNumber || "Not linked yet"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${accountTone[account.status] || "bg-slate-100 text-slate-700"}`}>{account.status}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn-green" onClick={() => accountAction(account._id, "start")} disabled={busy === `start-${account._id}`}>{busy === `start-${account._id}` ? "Starting..." : "Start"}</button>
                    <button type="button" className="btn-red" onClick={() => accountAction(account._id, "stop")} disabled={busy === `stop-${account._id}`}>{busy === `stop-${account._id}` ? "Stopping..." : "Stop"}</button>
                    <button type="button" className="btn-dark" onClick={() => showQr(account)} disabled={busy === `qr-${account._id}`}>{busy === `qr-${account._id}` ? "Loading..." : "Show QR"}</button>
                    <button type="button" className="btn-red" onClick={() => deleteAccount(account)} disabled={busy === `delete-${account._id}`}>{busy === `delete-${account._id}` ? "Deleting..." : "Delete"}</button>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-[130px_120px_120px] sm:items-center">
                    <p className="text-xs text-slate-500">Sent today: {account.sentToday}</p>
                    <input className="input text-xs" type="number" min="1" max="500" value={dailyDrafts[account._id] ?? account.dailyLimit} onChange={(e) => setDailyDrafts((prev) => ({ ...prev, [account._id]: e.target.value }))} />
                    <button type="button" className="btn-amber" onClick={() => updateDailyLimit(account._id)} disabled={busy === `limit-${account._id}`}>{busy === `limit-${account._id}` ? "Saving..." : "Save Limit"}</button>
                  </div>
                  {account.lastError && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{account.lastError}</p>}
                </div>
              ))}
              {accounts.length === 0 && !dashboardLoading && <p className="empty col-span-2">No sessions yet.</p>}
            </div>

            {qrPreview && (
              <section className="glass-panel rounded-2xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-xl font-semibold text-slate-900">QR Preview</h3>
                    <p className="text-sm text-slate-600">{qrPreview.accountName} • {qrPreview.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-dark" onClick={async () => {
                      try {
                        const qr = await apiRequest(`/accounts/${qrPreview.accountId}/qr`, { token });
                        setQrPreview((prev) => ({ ...prev, ...qr }));
                      } catch (error) {
                        setNotice({ type: "error", text: error.message });
                      }
                    }}>Refresh QR</button>
                    <button type="button" className="btn-dark" onClick={() => setQrPreview(null)}>Close</button>
                  </div>
                </div>
                <div className="mt-4">{qrPreview.qrCodeDataUrl ? <img src={qrPreview.qrCodeDataUrl} alt="WhatsApp QR" className="h-56 w-56 rounded-2xl border-4 border-white shadow-lg" /> : <p className="empty">QR not available yet.</p>}</div>
              </section>
            )}
          </section>
        )}

        {currentPage === "templates" && (
          <section className="space-y-6">
            <header className="flex items-center justify-between">
              <div>
                <p className="font-heading text-sm uppercase tracking-[0.2em] text-slate-500">Manage</p>
                <h1 className="font-heading text-3xl font-bold text-slate-900">Templates</h1>
              </div>
              <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </header>

            <div className="glass-panel rounded-2xl p-6">
              <h2 className="font-heading text-xl font-semibold text-slate-900">Create New Template</h2>
              <form className="mt-4 space-y-3" onSubmit={createTemplate}>
                <input className="input" placeholder="Template name" value={templateForm.name} onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))} required />
                <textarea className="input min-h-32" placeholder="Template body" value={templateForm.body} onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))} required />
                <button className="btn-cyan" disabled={busy === "create-template"}>{busy === "create-template" ? "Saving..." : "Save Template"}</button>
              </form>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((template) => (
                <div key={template._id} className="glass-panel rounded-2xl p-6">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-heading text-base font-semibold text-slate-900">{template.name}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{formatDate(template.updatedAt)}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{template.body}</p>
                </div>
              ))}
              {templates.length === 0 && !dashboardLoading && <p className="empty col-span-2">No templates yet.</p>}
            </div>
          </section>
        )}

        {currentPage === "campaigns" && (
          <section className="space-y-6">
            <header className="flex items-center justify-between">
              <div>
                <p className="font-heading text-sm uppercase tracking-[0.2em] text-slate-500">Manage</p>
                <h1 className="font-heading text-3xl font-bold text-slate-900">Campaigns</h1>
              </div>
              <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </header>

            <div className="glass-panel rounded-2xl p-6">
              <h2 className="font-heading text-xl font-semibold text-slate-900">Create Campaign</h2>
              <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={createCampaign}>
                <div className="space-y-3">
                  <input className="input" placeholder="Campaign title" value={campaignForm.title} onChange={(e) => setCampaignForm((p) => ({ ...p, title: e.target.value }))} required />
                  <select className="input" value={campaignForm.accountId} onChange={(e) => setCampaignForm((p) => ({ ...p, accountId: e.target.value }))} required>
                    <option value="">Select session</option>
                    {accounts.map((account) => (
                      <option key={account._id} value={account._id}>{account.name} ({account.status})</option>
                    ))}
                  </select>
                  <select className="input" value={campaignForm.templateId} onChange={(e) => {
                    const id = e.target.value;
                    const selected = templates.find((item) => item._id === id);
                    setCampaignForm((p) => ({ ...p, templateId: id, messageBody: selected ? selected.body : p.messageBody }));
                  }}>
                    <option value="">No template (custom text)</option>
                    {templates.map((template) => (
                      <option key={template._id} value={template._id}>{template.name}</option>
                    ))}
                  </select>
                  <textarea className="input min-h-32" placeholder="Message body" value={campaignForm.messageBody} onChange={(e) => setCampaignForm((p) => ({ ...p, messageBody: e.target.value }))} required />
                </div>
                <div className="space-y-3">
                  <textarea className="input min-h-[230px]" placeholder="Enter recipients (one per line, comma-separated, or semicolon-separated)" value={campaignForm.recipientsText} onChange={(e) => setCampaignForm((p) => ({ ...p, recipientsText: e.target.value }))} required />
                  <div className="rounded-xl bg-white/80 p-3 text-sm text-slate-700">Recipients: <span className="font-heading text-lg text-cyan-700">{recipientsTotal}</span></div>
                  <button className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400" disabled={busy === "create-campaign"}>{busy === "create-campaign" ? "Queueing..." : "Queue Campaign"}</button>
                </div>
              </form>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="glass-panel rounded-2xl p-6">
                <h2 className="font-heading text-xl font-semibold text-slate-900">All Campaigns</h2>
                <div className="mt-4 space-y-3">
                  {campaigns.length === 0 && !dashboardLoading && <p className="empty">No campaigns yet.</p>}
                  {campaigns.map((campaign) => {
                    const processed = campaign.sentCount + campaign.failedCount;
                    const progress = campaign.totalRecipients ? Math.min(100, Math.round((processed / campaign.totalRecipients) * 100)) : 0;
                    return (
                      <div key={campaign._id} className="rounded-xl border border-white/70 bg-white/72 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-heading text-base font-semibold text-slate-900">{campaign.title}</p>
                            <p className="text-xs text-slate-500">{campaign.account?.name || "Unknown"} • {formatDate(campaign.createdAt)}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${campaignTone[campaign.status] || "bg-slate-100 text-slate-700"}`}>{campaign.status}</span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500" style={{ width: `${progress}%` }} /></div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                          <span className="rounded-full bg-cyan-100 px-2.5 py-1">Total: {campaign.totalRecipients}</span>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1">Sent: {campaign.sentCount}</span>
                          <span className="rounded-full bg-rose-100 px-2.5 py-1">Failed: {campaign.failedCount}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(campaign.status === "queued" || campaign.status === "running") && <button type="button" className="btn-amber" onClick={() => campaignAction(campaign._id, "pause")} disabled={busy === `pause-${campaign._id}`}>{busy === `pause-${campaign._id}` ? "Pausing..." : "Pause"}</button>}
                          {campaign.status === "paused" && <button type="button" className="btn-green" onClick={() => campaignAction(campaign._id, "resume")} disabled={busy === `resume-${campaign._id}`}>{busy === `resume-${campaign._id}` ? "Resuming..." : "Resume"}</button>}
                          <button type="button" className="btn-dark" onClick={() => loadMessages(campaign)}>View Messages</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-6">
                <h2 className="font-heading text-xl font-semibold text-slate-900">Delivery Detail</h2>
                {selectedCampaign ? <p className="mt-1 text-xs text-slate-500">Campaign: {selectedCampaign.title}</p> : <p className="mt-1 text-sm text-slate-500">Select a campaign to inspect messages.</p>}
                {messagesLoading ? <p className="mt-4 rounded-xl bg-white/70 p-4 text-sm text-slate-600">Loading messages...</p> : (
                  <div className="mt-4 max-h-[460px] space-y-2 overflow-auto pr-1">
                    {messages.length === 0 ? <p className="empty">No messages loaded.</p> : messages.map((message) => (
                      <div key={message._id} className="rounded-xl border border-white/70 bg-white/75 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-slate-800">{message.recipient}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${message.status === "sent" ? "bg-emerald-100 text-emerald-700" : message.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{message.status}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{message.text}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Tries: {message.tryCount} • Sent: {formatDate(message.sentAt)}</p>
                        {message.error && <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{message.error}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {currentPage === "messages" && (
          <section className="space-y-6">
            <header className="flex items-center justify-between">
              <div>
                <p className="font-heading text-sm uppercase tracking-[0.2em] text-slate-500">View All</p>
                <h1 className="font-heading text-3xl font-bold text-slate-900">Messages</h1>
              </div>
              <button className="btn-cyan" onClick={loadAllMessages} disabled={allMessagesLoading}>
                {allMessagesLoading ? "Loading..." : "Load All Messages"}
              </button>
            </header>

            <div className="glass-panel rounded-2xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-xl font-semibold text-slate-900">All Sent Messages</h2>
                <p className="text-sm text-slate-600">Total: {allMessages.length} messages</p>
              </div>

              {allMessagesLoading ? (
                <p className="empty">Loading messages...</p>
              ) : allMessages.length === 0 ? (
                <p className="empty">No messages yet. Click "Load All Messages" to view.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 text-left">
                        <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Mobile Number</th>
                        <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Message</th>
                        <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Campaign</th>
                        <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                        <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Time</th>
                        <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allMessages.map((message) => {
                        const { date, time } = formatDateTime(message.sentAt || message.createdAt);
                        return (
                          <tr key={message._id} className="hover:bg-slate-50/50">
                            <td className="py-3 pr-4">
                              <p className="font-medium text-slate-900">{message.recipient}</p>
                            </td>
                            <td className="py-3 pr-4">
                              <p className="max-w-xs truncate text-sm text-slate-600">{message.text}</p>
                            </td>
                            <td className="py-3 pr-4">
                              <p className="text-sm text-slate-600">{message.campaignTitle || "—"}</p>
                            </td>
                            <td className="py-3 pr-4">
                              <p className="text-sm text-slate-600">{date}</p>
                            </td>
                            <td className="py-3 pr-4">
                              <p className="text-sm text-slate-600">{time}</p>
                            </td>
                            <td className="py-3">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                                message.status === "sent"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : message.status === "failed"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-slate-100 text-slate-700"
                              }`}>
                                {message.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {booting && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/20 backdrop-blur-[2px]">
            <div className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-xl">Loading...</div>
          </div>
        )}
      </main>
    </div>
  );
}

export default NewApp;
