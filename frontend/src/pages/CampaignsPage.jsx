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
  const eligibleAccounts = accounts.filter(
    (account) => account.isActive !== false && account.status === "authenticated",
  );

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.25em] text-slate-500">Manage</p>
          <h1 className="font-heading text-3xl font-bold text-slate-800">Campaigns</h1>
        </div>
        <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="glass-panel-dark rounded-2xl p-6">
        <h2 className="font-heading text-lg font-semibold text-slate-800">Create Campaign</h2>
        <form className="mt-5 grid gap-5 lg:grid-cols-2" onSubmit={createCampaign}>
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
              <p className="rounded-lg bg-cyan-950/50 px-3 py-2 text-xs text-cyan-300">
                This template includes a {selectedTemplate.mediaType}.
              </p>
            )}
            <textarea
              className="input-dark min-h-32"
              placeholder="Message body"
              value={campaignForm.messageBody}
              onChange={(e) => setCampaignForm((p) => ({ ...p, messageBody: e.target.value }))}
            />
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
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="input-dark"
                type="number"
                min="1"
                max="500"
                placeholder="Per number/day safeguard"
                value={campaignForm.perNumberDailySafeguard}
                onChange={(e) =>
                  setCampaignForm((p) => ({ ...p, perNumberDailySafeguard: e.target.value }))
                }
                required
              />
              <input
                className="input-dark"
                type="number"
                min="1"
                max="100"
                placeholder="Per number/hour safeguard"
                value={campaignForm.perNumberHourlySafeguard}
                onChange={(e) =>
                  setCampaignForm((p) => ({ ...p, perNumberHourlySafeguard: e.target.value }))
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
                      Safeguard/day per number: {campaign.perNumberDailySafeguard || 20}
                    </span>
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">
                      Safeguard/hour per number: {campaign.perNumberHourlySafeguard || 2}
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
                    <button type="button" className="btn-dark" onClick={() => loadMessages(campaign)}>
                      View Messages
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
                      <p className="font-semibold text-slate-800">{message.recipient}</p>
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
