import { formatDate } from "../utils/formatters";
import { campaignTone } from "../utils/tones";

function CampaignsPage({
  refreshing,
  refreshAll,
  campaignForm,
  setCampaignForm,
  createCampaign,
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
  const selectedTemplate = templates.find((item) => item._id === campaignForm.templateId) || null;

  return (
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
              <option value="">Select session</option>
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
                const selected = templates.find((item) => item._id === id);
                setCampaignForm((p) => ({
                  ...p,
                  templateId: id,
                  messageBody: selected ? selected.body : p.messageBody,
                }));
              }}
            >
              <option value="">No template (custom text)</option>
              {templates.map((template) => (
                <option key={template._id} value={template._id}>
                  {template.name}
                  {template.mediaType ? " [media]" : ""}
                </option>
              ))}
            </select>
            {selectedTemplate?.mediaType && (
              <p className="rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-700">
                This template includes a {selectedTemplate.mediaType}.
              </p>
            )}
            <textarea
              className="input min-h-32"
              placeholder="Message body"
              value={campaignForm.messageBody}
              onChange={(e) => setCampaignForm((p) => ({ ...p, messageBody: e.target.value }))}
            />
          </div>
          <div className="space-y-3">
            <textarea
              className="input min-h-[230px]"
              placeholder="Enter recipients (one per line, comma-separated, or semicolon-separated)"
              value={campaignForm.recipientsText}
              onChange={(e) => setCampaignForm((p) => ({ ...p, recipientsText: e.target.value }))}
              required
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="input"
                type="number"
                min="1"
                max="5000"
                placeholder="Total messages to send (optional)"
                value={campaignForm.maxMessages}
                onChange={(e) => setCampaignForm((p) => ({ ...p, maxMessages: e.target.value }))}
              />
              <input
                className="input"
                type="number"
                min="1"
                max="5000"
                placeholder="Messages per day (optional)"
                value={campaignForm.dailyMessageLimit}
                onChange={(e) => setCampaignForm((p) => ({ ...p, dailyMessageLimit: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-slate-500">Campaign From</p>
                <input
                  className="input"
                  type="date"
                  value={campaignForm.dateFrom}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, dateFrom: e.target.value }))}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-500">Campaign To</p>
                <input
                  className="input"
                  type="date"
                  value={campaignForm.dateTo}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, dateTo: e.target.value }))}
                />
              </div>
            </div>
            <div className="rounded-xl bg-white/80 p-3 text-sm text-slate-700">
              Recipients: <span className="font-heading text-lg text-cyan-700">{recipientsTotal}</span>
            </div>
            <button
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={busy === "create-campaign"}
            >
              {busy === "create-campaign" ? "Queueing..." : "Queue Campaign"}
            </button>
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
              const progress = campaign.totalRecipients
                ? Math.min(100, Math.round((processed / campaign.totalRecipients) * 100))
                : 0;

              return (
                <div key={campaign._id} className="rounded-xl border border-white/70 bg-white/72 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-heading text-base font-semibold text-slate-900">{campaign.title}</p>
                      <p className="text-xs text-slate-500">
                        {campaign.account?.name || "Unknown"} • {formatDate(campaign.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                        campaignTone[campaign.status] || "bg-slate-100 text-slate-700"
                      }`}
                    >
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
                    {(campaign.dateFrom || campaign.dateTo) && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
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
                    <button type="button" className="btn-dark" onClick={() => loadMessages(campaign)}>
                      View Messages
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h2 className="font-heading text-xl font-semibold text-slate-900">Delivery Detail</h2>
          {selectedCampaign ? (
            <p className="mt-1 text-xs text-slate-500">Campaign: {selectedCampaign.title}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Select a campaign to inspect messages.</p>
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
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{message.text || "(Media only)"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Tries: {message.tryCount} • Sent: {formatDate(message.sentAt)}</p>
                    {message.error && (
                      <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{message.error}</p>
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
