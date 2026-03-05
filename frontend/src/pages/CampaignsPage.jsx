import { useState } from "react";
import { formatDate } from "../utils/formatters";
import { campaignTone } from "../utils/tones";

function CampaignsPage({
  refreshing,
  refreshAll,
  campaignForm,
  setCampaignForm,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  busy,
  accounts,
  templates,
  recipientsTotal,
  campaigns,
  dashboardLoading,
  campaignAction,
  loadMessages,
  selectedCampaign,
  messagesLoading,
  messages,
}) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editForm, setEditForm] = useState({
    title: "",
    messageBody: "",
    dailyMessageLimit: "",
    perRecipientMessageLimit: "1",
    dateFrom: "",
    dateTo: "",
  });
  const selectedTemplate = templates.find((item) => item._id === campaignForm.templateId) || null;
  const eligibleAccounts = accounts.filter(
    (account) => account.isActive !== false && account.status === "authenticated",
  );

  function openEditPopup(campaign) {
    setEditingCampaign(campaign);
    setEditForm({
      title: campaign.title || "",
      messageBody: campaign.messageBody || "",
      dailyMessageLimit:
        campaign.dailyMessageLimit == null ? "" : String(campaign.dailyMessageLimit),
      perRecipientMessageLimit: String(campaign.perRecipientMessageLimit || 1),
      dateFrom: campaign.dateFrom || "",
      dateTo: campaign.dateTo || "",
    });
    setShowEditPopup(true);
  }

  async function submitEditCampaign(e) {
    e.preventDefault();
    if (!editingCampaign?._id) return;

    const ok = await updateCampaign(editingCampaign._id, {
      title: editForm.title.trim(),
      messageBody: editForm.messageBody,
      dailyMessageLimit: editForm.dailyMessageLimit
        ? Number(editForm.dailyMessageLimit)
        : undefined,
      perRecipientMessageLimit: Number(editForm.perRecipientMessageLimit || 1),
      dateFrom: editForm.dateFrom || undefined,
      dateTo: editForm.dateTo || undefined,
    });

    if (ok) {
      setShowEditPopup(false);
      setEditingCampaign(null);
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.25em] text-slate-500">Manage</p>
          <h1 className="font-heading text-3xl font-bold text-slate-800">Campaigns</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600 text-2xl font-semibold text-white transition hover:bg-cyan-500"
            onClick={() => setShowCreatePopup(true)}
            aria-label="Add campaign"
            title="Add campaign"
          >
            +
          </button>
          <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <div className="glass-panel-dark rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-800">Add Campaign</h2>
            <p className="mt-1 text-sm text-slate-500">Click + to open campaign form popup.</p>
          </div>
          <button type="button" className="btn-cyan" onClick={() => setShowCreatePopup(true)}>
            + Add Campaign
          </button>
        </div>
      </div>

      {showCreatePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowCreatePopup(false)}>
          <div className="glass-panel-dark w-full max-w-5xl rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-semibold text-slate-800">Add Campaign</h2>
                <p className="text-sm text-slate-500">Fill details and queue your campaign.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
                onClick={() => setShowCreatePopup(false)}
                aria-label="Close add campaign popup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form className="grid gap-5 lg:grid-cols-2" onSubmit={createCampaign}>
              <div className="space-y-3">
                <input
                  className="input-dark"
                  placeholder="Campaign title"
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, title: e.target.value }))}
                  required
                />
                <p className="rounded-lg bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
                  Sending Accounts: Automatically uses all active authenticated sessions ({eligibleAccounts.length})
                </p>
                <p className="text-xs text-slate-500">
                  {eligibleAccounts.length
                    ? eligibleAccounts.map((account) => account.name).join(", ")
                    : "No active authenticated session found."}
                </p>
                <select
                  className="input-dark"
                  required
                  value={campaignForm.templateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const selected = templates.find((item) => item._id === id);
                    setCampaignForm((p) => ({
                      ...p,
                      templateId: id,
                      messageBody: selected ? selected.body : "",
                    }));
                  }}
                >
                  <option value="">Select message template</option>
                  {templates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.name}
                      {template.mediaType ? " [media]" : ""}
                    </option>
                  ))}
                </select>
                {!templates.length && (
                  <p className="rounded-lg bg-amber-950/50 px-3 py-2 text-xs text-amber-300">
                    No templates found. Create a template first.
                  </p>
                )}
                {selectedTemplate?.mediaType && (
                  <p className="rounded-lg bg-cyan-950/50 px-3 py-2 text-xs text-cyan-300">
                    This template includes a {selectedTemplate.mediaType}.
                  </p>
                )}
                {selectedTemplate?.body && (
                  <div className="rounded-lg bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                    Template message preview: {selectedTemplate.body}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <textarea
                  className="input-dark min-h-[230px]"
                  placeholder="Enter recipients (one per line, comma-separated, or semicolon-separated)"
                  value={campaignForm.recipientsText}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, recipientsText: e.target.value }))}
                  required
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="input-dark"
                    type="number"
                    min="1"
                    max="5000"
                    placeholder="Total messages to send"
                    value={campaignForm.maxMessages}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, maxMessages: e.target.value }))}
                    required
                  />
                  <input
                    className="input-dark"
                    type="number"
                    min="1"
                    max="5000"
                    placeholder="Messages per day (optional)"
                    value={campaignForm.dailyMessageLimit}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, dailyMessageLimit: e.target.value }))}
                  />
                  <input
                    className="input-dark"
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Messages per person"
                    value={campaignForm.perRecipientMessageLimit}
                    onChange={(e) =>
                      setCampaignForm((p) => ({ ...p, perRecipientMessageLimit: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Campaign From</p>
                    <input
                      className="input-dark"
                      type="date"
                      value={campaignForm.dateFrom}
                      onChange={(e) => setCampaignForm((p) => ({ ...p, dateFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Campaign To</p>
                    <input
                      className="input-dark"
                      type="date"
                      value={campaignForm.dateTo}
                      onChange={(e) => setCampaignForm((p) => ({ ...p, dateTo: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="rounded-xl bg-slate-800/90 p-3 text-sm text-slate-300">
                  Recipients: <span className="font-heading text-lg text-cyan-400">{recipientsTotal}</span>
                </div>
                <button
                  className="w-full rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 text-sm font-semibold text-white transition hover:from-slate-700 hover:to-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy === "create-campaign"}
                >
                  {busy === "create-campaign" ? "Queueing..." : "Queue Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditPopup && editingCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowEditPopup(false)}
        >
          <div
            className="glass-panel-dark w-full max-w-3xl rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-semibold text-slate-800">Edit Campaign</h2>
                <p className="text-sm text-slate-500">
                  You can edit queued or paused campaigns.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
                onClick={() => setShowEditPopup(false)}
                aria-label="Close edit campaign popup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form className="grid gap-4" onSubmit={submitEditCampaign}>
              <input
                className="input-dark"
                placeholder="Campaign title"
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
              <textarea
                className="input-dark min-h-28"
                placeholder="Message body"
                value={editForm.messageBody}
                onChange={(e) => setEditForm((p) => ({ ...p, messageBody: e.target.value }))}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="input-dark"
                  type="number"
                  min="1"
                  max="5000"
                  placeholder="Messages per day (optional)"
                  value={editForm.dailyMessageLimit}
                  onChange={(e) => setEditForm((p) => ({ ...p, dailyMessageLimit: e.target.value }))}
                />
                <input
                  className="input-dark"
                  type="number"
                  min="1"
                  max="20"
                  placeholder="Messages per person"
                  value={editForm.perRecipientMessageLimit}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, perRecipientMessageLimit: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="input-dark"
                    type="date"
                    value={editForm.dateFrom}
                    onChange={(e) => setEditForm((p) => ({ ...p, dateFrom: e.target.value }))}
                  />
                  <input
                    className="input-dark"
                    type="date"
                    value={editForm.dateTo}
                    onChange={(e) => setEditForm((p) => ({ ...p, dateTo: e.target.value }))}
                  />
                </div>
              </div>
              <button
                className="w-full rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 text-sm font-semibold text-white transition hover:from-slate-700 hover:to-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy === `update-${editingCampaign._id}`}
              >
                {busy === `update-${editingCampaign._id}` ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="glass-panel-dark rounded-2xl p-6">
          <h2 className="font-heading text-lg font-semibold text-slate-800">All Campaigns</h2>
          <div className="mt-5 space-y-3">
            {campaigns.length === 0 && !dashboardLoading && <p className="empty-dark">No campaigns yet.</p>}
            {campaigns.map((campaign) => {
              const processed = campaign.sentCount + campaign.failedCount;
              const progress = campaign.totalRecipients
                ? Math.min(100, Math.round((processed / campaign.totalRecipients) * 100))
                : 0;

              return (
                <div key={campaign._id} className="card-dark rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-heading text-base font-semibold text-slate-800">{campaign.title}</p>
                      <p className="text-xs text-slate-500">
                        {(campaign.accounts?.length
                          ? campaign.accounts.map((acc) => acc.name).join(", ")
                          : campaign.account?.name || "Unknown")}{" "}
                        • {formatDate(campaign.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                        campaignTone[campaign.status] || "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-300">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-cyan-100 px-2.5 py-1">Total: {campaign.totalRecipients}</span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1">Sent: {campaign.sentCount}</span>
                    <span className="rounded-full bg-rose-100 px-2.5 py-1">Failed: {campaign.failedCount}</span>
                    {campaign.maxMessages && (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                        Target: {campaign.maxMessages}
                      </span>
                    )}
                    {campaign.dailyMessageLimit && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                        Per day: {campaign.dailyMessageLimit}
                      </span>
                    )}
                    <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-fuchsia-700">
                      Per person: {campaign.perRecipientMessageLimit || 1}
                    </span>
                    {(campaign.dateFrom || campaign.dateTo) && (
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">
                        Window: {campaign.dateFrom || "--"} to {campaign.dateTo || "--"}
                      </span>
                    )}
                    {campaign.mediaType && (
                      <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-700">
                        Media: {campaign.mediaType}
                      </span>
                    )}
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
                    {(campaign.status === "queued" ||
                      campaign.status === "paused" ||
                      campaign.status === "running") && (
                      <button
                        type="button"
                        className="btn-dark"
                        onClick={() => openEditPopup(campaign)}
                      >
                        Edit Campaign
                      </button>
                    )}
                    <button type="button" className="btn-dark" onClick={() => loadMessages(campaign)}>
                      View Messages
                    </button>
                    <button
                      type="button"
                      className="btn-red"
                      onClick={() => deleteCampaign(campaign)}
                      disabled={busy === `delete-campaign-${campaign._id}`}
                    >
                      {busy === `delete-campaign-${campaign._id}` ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel-dark rounded-2xl p-6">
          <h2 className="font-heading text-lg font-semibold text-slate-800">Delivery Detail</h2>
          {selectedCampaign ? (
            <p className="mt-1.5 text-xs text-slate-500">Campaign: {selectedCampaign.title}</p>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500">Select a campaign to inspect messages.</p>
          )}
          {selectedCampaign?.mediaData && (
            <div className="mt-3">
              {selectedCampaign.mediaType === "video" ? (
                <video src={selectedCampaign.mediaData} controls className="max-h-44 rounded-lg" />
              ) : (
                <img src={selectedCampaign.mediaData} alt={selectedCampaign.title} className="max-h-44 rounded-lg" />
              )}
            </div>
          )}
          {messagesLoading ? (
            <p className="mt-4 rounded-xl bg-slate-800/90 p-4 text-sm text-slate-300">Loading messages...</p>
          ) : (
            <div className="mt-4 max-h-[460px] space-y-2 overflow-auto pr-1">
              {messages.length === 0 ? (
                <p className="empty-dark">No messages loaded.</p>
              ) : (
                messages.map((message) => (
                  <div key={message._id} className="card-dark rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {message.senderMobileNumber || message.account?.phoneNumber || "Unknown"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          to {message.recipientMobileNumber || message.recipient || "--"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                          message.status === "sent"
                            ? "bg-emerald-100 text-emerald-700"
                            : message.status === "failed"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {message.status}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{message.text || "(Media only)"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Tries: {message.tryCount} • Sent: {formatDate(message.sentAt)}</p>
                    {message.error && (
                      <p className="mt-2 rounded bg-rose-950/50 px-2 py-1 text-[11px] text-rose-300">{message.error}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default CampaignsPage;
