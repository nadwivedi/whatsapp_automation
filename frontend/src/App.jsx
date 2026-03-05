import { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");

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

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function countRecipients(input) {
  return input
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean).length;
}

function App() {
  const [accounts, setAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [messages, setMessages] = useState([]);

  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);
  const [dailyDrafts, setDailyDrafts] = useState({});

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
    return {
      accounts: accounts.length,
      templates: templates.length,
      campaigns: campaigns.length,
      authenticated,
      running,
    };
  }, [accounts, templates, campaigns]);

  const recipientsTotal = useMemo(
    () => countRecipients(campaignForm.recipientsText),
    [campaignForm.recipientsText],
  );

  useEffect(() => {
    refreshDashboard();
    const timer = window.setInterval(() => refreshDashboard({ silent: true }), 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function refreshDashboard({ silent = false } = {}) {
    if (silent) setRefreshing(true);
    else setDashboardLoading(true);

    try {
      const [a, t, c] = await Promise.all([api("/accounts"), api("/templates"), api("/campaigns")]);
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
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setDashboardLoading(false);
      setRefreshing(false);
    }
  }

  async function createAccount(e) {
    e.preventDefault();
    setBusy("create-account");
    try {
      const payload = await api("/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: accountForm.name.trim(),
          phoneNumber: accountForm.phoneNumber.trim(),
          dailyLimit: Number(accountForm.dailyLimit),
        }),
      });
      setAccountForm({ name: "", phoneNumber: "", dailyLimit: 20 });
      setNotice({ type: "success", text: "Session created. Scan QR to authenticate." });
      await refreshDashboard({ silent: true });

      if (payload.account?._id) {
        const qr = await api(`/accounts/${payload.account._id}/qr`);
        setQrPreview({
          ...qr,
          accountName: payload.account.name,
        });
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
      await api(`/accounts/${accountId}/${action}`, { method: "POST" });
      setNotice({
        type: "success",
        text: action === "start" ? "Session started." : "Session stopped.",
      });
      await refreshDashboard({ silent: true });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function updateDailyLimit(accountId) {
    setBusy(`limit-${accountId}`);
    try {
      await api(`/accounts/${accountId}/daily-limit`, {
        method: "PATCH",
        body: JSON.stringify({ dailyLimit: Number(dailyDrafts[accountId]) }),
      });
      setNotice({ type: "success", text: "Daily limit updated." });
      await refreshDashboard({ silent: true });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function showQr(account) {
    setBusy(`qr-${account._id}`);
    try {
      const payload = await api(`/accounts/${account._id}/qr`);
      setQrPreview({ ...payload, accountName: account.name });
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
      await api("/templates", {
        method: "POST",
        body: JSON.stringify({ name: templateForm.name.trim(), body: templateForm.body.trim() }),
      });
      setTemplateForm({ name: "", body: "" });
      setNotice({ type: "success", text: "Template created." });
      await refreshDashboard({ silent: true });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function deleteAccount(account) {
    const shouldDelete = window.confirm(
      `Delete account "${account.name}"? This will also remove related campaigns and messages.`,
    );
    if (!shouldDelete) {
      return;
    }

    setBusy(`delete-${account._id}`);
    try {
      await api(`/accounts/${account._id}`, { method: "DELETE" });
      if (qrPreview?.accountId === account._id) {
        setQrPreview(null);
      }
      setSelectedCampaign(null);
      setMessages([]);
      setNotice({ type: "success", text: "Account deleted." });
      await refreshDashboard({ silent: true });
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
      await api("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          title: campaignForm.title.trim(),
          accountId: campaignForm.accountId,
          templateId: campaignForm.templateId || undefined,
          messageBody: campaignForm.messageBody,
          recipientsText: campaignForm.recipientsText,
        }),
      });
      setCampaignForm((prev) => ({ ...prev, title: "", recipientsText: "" }));
      setNotice({ type: "success", text: "Campaign queued." });
      await refreshDashboard({ silent: true });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function campaignAction(campaignId, action) {
    setBusy(`${action}-${campaignId}`);
    try {
      await api(`/campaigns/${campaignId}/${action}`, { method: "POST" });
      setNotice({ type: "success", text: `Campaign ${action}d.` });
      await refreshDashboard({ silent: true });
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
      const payload = await api(`/campaigns/${campaign._id}/messages`);
      setMessages(payload.messages || []);
    } catch (error) {
      setMessages([]);
      setNotice({ type: "error", text: error.message });
    } finally {
      setMessagesLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 text-slate-800 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-200/40 blur-2xl" />
          <div className="absolute -left-20 -bottom-16 h-56 w-56 rounded-full bg-amber-200/40 blur-2xl" />
          <div className="relative space-y-4">
            <p className="font-heading text-sm uppercase tracking-[0.22em] text-slate-500">
              WhatsApp Command Center
            </p>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="font-heading text-3xl leading-tight text-slate-900 sm:text-4xl">
                  Beautiful Frontend for Bulk WhatsApp Messaging
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
                  Manage accounts, templates, campaign queue, and message-level status from one React
                  and Tailwind dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => refreshDashboard({ silent: true })}
                disabled={refreshing}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="metric-box"><p>Accounts</p><h3>{stats.accounts}</h3></div>
              <div className="metric-box"><p>Authenticated</p><h3 className="text-emerald-700">{stats.authenticated}</h3></div>
              <div className="metric-box"><p>Templates</p><h3>{stats.templates}</h3></div>
              <div className="metric-box"><p>Campaigns</p><h3>{stats.campaigns}</h3></div>
              <div className="metric-box"><p>Running</p><h3 className="text-amber-700">{stats.running}</h3></div>
            </div>

            {notice && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium ${notice.type === "error" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                {notice.text}
              </div>
            )}
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="glass-panel rounded-3xl p-6">
            <h2 className="font-heading text-2xl text-slate-900">Accounts & Sessions</h2>
            <p className="mt-1 text-sm text-slate-600">
              Add mobile number, create a fresh session, then scan QR to connect WhatsApp.
            </p>

            <form className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_130px_140px]" onSubmit={createAccount}>
              <input
                className="input"
                placeholder="Account name (optional)"
                value={accountForm.name}
                onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Mobile number"
                value={accountForm.phoneNumber}
                onChange={(e) => setAccountForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                required
              />
              <input
                className="input"
                type="number"
                min="1"
                max="500"
                value={accountForm.dailyLimit}
                onChange={(e) => setAccountForm((p) => ({ ...p, dailyLimit: e.target.value }))}
                required
              />
              <button className="btn-cyan" disabled={busy === "create-account"}>
                {busy === "create-account" ? "Creating..." : "Create Session"}
              </button>
            </form>

            <div className="mt-5 space-y-3">
              {accounts.length === 0 && !dashboardLoading && <p className="empty">No accounts yet.</p>}
              {accounts.map((account) => (
                <div key={account._id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg text-slate-900">{account.name}</p>
                      <p className="text-sm text-slate-500">{account.phoneNumber || "Number not linked yet"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${accountTone[account.status] || "bg-slate-100 text-slate-700"}`}>
                      {account.status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-green"
                      onClick={() => accountAction(account._id, "start")}
                      disabled={busy === `start-${account._id}`}
                    >
                      {busy === `start-${account._id}` ? "Starting..." : "Start"}
                    </button>
                    <button
                      type="button"
                      className="btn-red"
                      onClick={() => accountAction(account._id, "stop")}
                      disabled={busy === `stop-${account._id}`}
                    >
                      {busy === `stop-${account._id}` ? "Stopping..." : "Stop"}
                    </button>
                    <button
                      type="button"
                      className="btn-dark"
                      onClick={() => showQr(account)}
                      disabled={busy === `qr-${account._id}`}
                    >
                      {busy === `qr-${account._id}` ? "Loading..." : "Show QR"}
                    </button>
                    <button
                      type="button"
                      className="btn-red"
                      onClick={() => deleteAccount(account)}
                      disabled={busy === `delete-${account._id}`}
                    >
                      {busy === `delete-${account._id}` ? "Deleting..." : "Delete"}
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[130px_120px_120px] sm:items-center">
                    <p className="text-xs text-slate-500">Sent today: {account.sentToday}</p>
                    <input
                      className="input text-xs"
                      type="number"
                      min="1"
                      max="500"
                      value={dailyDrafts[account._id] ?? account.dailyLimit}
                      onChange={(e) =>
                        setDailyDrafts((prev) => ({ ...prev, [account._id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn-amber"
                      onClick={() => updateDailyLimit(account._id)}
                      disabled={busy === `limit-${account._id}`}
                    >
                      {busy === `limit-${account._id}` ? "Saving..." : "Save Limit"}
                    </button>
                  </div>

                  {account.lastError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{account.lastError}</p>}
                </div>
              ))}
            </div>
          </article>

          <article className="glass-panel rounded-3xl p-6">
            <h2 className="font-heading text-2xl text-slate-900">Templates</h2>
            <p className="mt-1 text-sm text-slate-600">Store reusable message formats for campaigns.</p>

            <form className="mt-4 space-y-3" onSubmit={createTemplate}>
              <input
                className="input"
                placeholder="Template name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
              <textarea
                className="input min-h-28"
                placeholder="Template body"
                value={templateForm.body}
                onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))}
                required
              />
              <button className="btn-cyan" disabled={busy === "create-template"}>
                {busy === "create-template" ? "Saving..." : "Save Template"}
              </button>
            </form>

            <div className="mt-5 space-y-3">
              {templates.length === 0 && !dashboardLoading && <p className="empty">No templates yet.</p>}
              {templates.map((template) => (
                <div key={template._id} className="card">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-heading text-base text-slate-900">{template.name}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                      {formatDate(template.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{template.body}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="glass-panel rounded-3xl p-6">
          <h2 className="font-heading text-2xl text-slate-900">Launch Campaign</h2>
          <p className="mt-1 text-sm text-slate-600">Paste recipients using new lines, commas, or semicolons.</p>

          <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={createCampaign}>
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Campaign title"
                value={campaignForm.title}
                onChange={(e) => setCampaignForm((p) => ({ ...p, title: e.target.value }))}
                required
              />

              <select
                className="input"
                value={campaignForm.accountId}
                onChange={(e) => setCampaignForm((p) => ({ ...p, accountId: e.target.value }))}
                required
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.name} ({account.status})
                  </option>
                ))}
              </select>

              <select
                className="input"
                value={campaignForm.templateId}
                onChange={(e) => {
                  const id = e.target.value;
                  const chosen = templates.find((t) => t._id === id);
                  setCampaignForm((p) => ({
                    ...p,
                    templateId: id,
                    messageBody: chosen ? chosen.body : p.messageBody,
                  }));
                }}
              >
                <option value="">No template (custom text)</option>
                {templates.map((template) => (
                  <option key={template._id} value={template._id}>
                    {template.name}
                  </option>
                ))}
              </select>

              <textarea
                className="input min-h-32"
                placeholder="Message body"
                value={campaignForm.messageBody}
                onChange={(e) => setCampaignForm((p) => ({ ...p, messageBody: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-3">
              <textarea
                className="input min-h-[220px]"
                placeholder="Enter recipients (one per line, comma-separated, or semicolon-separated)"
                value={campaignForm.recipientsText}
                onChange={(e) => setCampaignForm((p) => ({ ...p, recipientsText: e.target.value }))}
                required
              />

              <div className="rounded-xl bg-white/80 p-3 text-sm text-slate-700">
                Recipients: <span className="font-heading text-lg text-cyan-700">{recipientsTotal}</span>
              </div>

              <button className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400" disabled={busy === "create-campaign"}>
                {busy === "create-campaign" ? "Queueing..." : "Queue Campaign"}
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <article className="glass-panel rounded-3xl p-6">
            <h2 className="font-heading text-2xl text-slate-900">Campaign Monitor</h2>

            <div className="mt-4 space-y-3">
              {campaigns.length === 0 && !dashboardLoading && <p className="empty">No campaigns yet.</p>}
              {campaigns.map((campaign) => {
                const processed = campaign.sentCount + campaign.failedCount;
                const progress = campaign.totalRecipients
                  ? Math.min(100, Math.round((processed / campaign.totalRecipients) * 100))
                  : 0;

                return (
                  <div key={campaign._id} className="card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-heading text-base text-slate-900">{campaign.title}</p>
                        <p className="text-xs text-slate-500">
                          {campaign.account?.name || "Unknown"} • {formatDate(campaign.createdAt)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${campaignTone[campaign.status] || "bg-slate-100 text-slate-700"}`}>
                        {campaign.status}
                      </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-cyan-100 px-2.5 py-1">Total: {campaign.totalRecipients}</span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1">Sent: {campaign.sentCount}</span>
                      <span className="rounded-full bg-rose-100 px-2.5 py-1">Failed: {campaign.failedCount}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(campaign.status === "queued" || campaign.status === "running") && (
                        <button
                          type="button"
                          className="btn-amber"
                          onClick={() => campaignAction(campaign._id, "pause")}
                          disabled={busy === `pause-${campaign._id}`}
                        >
                          {busy === `pause-${campaign._id}` ? "Pausing..." : "Pause"}
                        </button>
                      )}

                      {campaign.status === "paused" && (
                        <button
                          type="button"
                          className="btn-green"
                          onClick={() => campaignAction(campaign._id, "resume")}
                          disabled={busy === `resume-${campaign._id}`}
                        >
                          {busy === `resume-${campaign._id}` ? "Resuming..." : "Resume"}
                        </button>
                      )}

                      <button type="button" className="btn-dark" onClick={() => loadMessages(campaign)}>
                        View Messages
                      </button>
                    </div>

                    {campaign.lastError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{campaign.lastError}</p>}
                  </div>
                );
              })}
            </div>
          </article>

          <article className="glass-panel rounded-3xl p-6">
            <h2 className="font-heading text-2xl text-slate-900">Delivery Detail</h2>
            {selectedCampaign ? (
              <p className="mt-1 text-xs text-slate-500">Campaign: {selectedCampaign.title}</p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">Select a campaign to inspect messages.</p>
            )}

            {messagesLoading ? (
              <p className="mt-4 rounded-xl bg-white/70 p-4 text-sm text-slate-600">Loading messages...</p>
            ) : (
              <div className="mt-4 max-h-[460px] space-y-2 overflow-auto pr-1">
                {messages.length === 0 ? (
                  <p className="empty">No messages loaded.</p>
                ) : (
                  messages.map((message) => (
                    <div key={message._id} className="rounded-xl border border-white/70 bg-white/75 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-800">{message.recipient}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                            message.status === "sent"
                              ? "bg-emerald-100 text-emerald-700"
                              : message.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {message.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-600">{message.text}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Tries: {message.tryCount} • Sent: {formatDate(message.sentAt)}</p>
                      {message.error && <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{message.error}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </article>
        </section>

        {qrPreview && (
          <section className="glass-panel rounded-3xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl text-slate-900">QR Preview</h2>
                <p className="text-sm text-slate-600">{qrPreview.accountName} • {qrPreview.status}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-dark"
                  onClick={async () => {
                    try {
                      const qr = await api(`/accounts/${qrPreview.accountId}/qr`);
                      setQrPreview((prev) => ({
                        ...prev,
                        ...qr,
                      }));
                    } catch (error) {
                      setNotice({ type: "error", text: error.message });
                    }
                  }}
                >
                  Refresh QR
                </button>
                <button type="button" className="btn-dark" onClick={() => setQrPreview(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-6">
              {qrPreview.qrCodeDataUrl ? (
                <img
                  src={qrPreview.qrCodeDataUrl}
                  alt="WhatsApp QR"
                  className="h-56 w-56 rounded-2xl border border-white/70 bg-white p-2"
                />
              ) : (
                <p className="empty">QR not available yet. Start/restart session to generate one.</p>
              )}
              {qrPreview.lastError && <p className="max-w-xl rounded-xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{qrPreview.lastError}</p>}
            </div>
          </section>
        )}

        {dashboardLoading && (
          <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/20 backdrop-blur-[2px]">
            <div className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-xl">
              Loading dashboard...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

