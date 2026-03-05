import { formatDate } from "../utils/formatters";
import { accountTone, campaignTone } from "../utils/tones";

function DashboardPage({ stats, campaigns, accounts, refreshing, refreshAll }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div>
          <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.2em] text-slate-500">Overview</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
        </div>
        <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="glass-panel group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-transform hover:scale-[1.02]">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-cyan-200/50 transition-transform group-hover:scale-150" />
          <p className="relative text-xs uppercase tracking-wider text-slate-500">Total Accounts</p>
          <p className="relative font-heading text-3xl sm:text-4xl font-bold text-slate-900">{stats.accounts}</p>
          <p className="relative mt-1 text-xs sm:text-sm text-emerald-600">{stats.authenticated} authenticated</p>
        </div>

        <div className="glass-panel group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-transform hover:scale-[1.02]">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-200/50 transition-transform group-hover:scale-150" />
          <p className="relative text-xs uppercase tracking-wider text-slate-500">Total Campaigns</p>
          <p className="relative font-heading text-3xl sm:text-4xl font-bold text-slate-900">{stats.campaigns}</p>
          <p className="relative mt-1 text-xs sm:text-sm text-amber-600">{stats.running} running</p>
        </div>

        <div className="glass-panel group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-transform hover:scale-[1.02]">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-amber-200/50 transition-transform group-hover:scale-150" />
          <p className="relative text-xs uppercase tracking-wider text-slate-500">Messages Sent</p>
          <p className="relative font-heading text-3xl sm:text-4xl font-bold text-slate-900">{stats.totalSent}</p>
          <p className="relative mt-1 text-xs sm:text-sm text-rose-600">{stats.totalFailed} failed</p>
        </div>

        <div className="glass-panel group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-transform hover:scale-[1.02]">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-violet-200/50 transition-transform group-hover:scale-150" />
          <p className="relative text-xs uppercase tracking-wider text-slate-500">Templates</p>
          <p className="relative font-heading text-3xl sm:text-4xl font-bold text-slate-900">{stats.templates}</p>
          <p className="relative mt-1 text-xs sm:text-sm text-slate-600">reusable messages</p>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-2xl p-4 sm:p-6">
          <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-900">Recent Campaigns</h2>
          <div className="mt-4 space-y-3">
            {campaigns.slice(0, 5).map((campaign) => {
              const processed = campaign.sentCount + campaign.failedCount;
              const progress = campaign.totalRecipients
                ? Math.min(100, Math.round((processed / campaign.totalRecipients) * 100))
                : 0;

              return (
                <div key={campaign._id} className="rounded-xl bg-white/70 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{campaign.title}</p>
                      <p className="text-xs text-slate-500">{formatDate(campaign.createdAt)}</p>
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
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
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

        <div className="glass-panel rounded-2xl p-4 sm:p-6">
          <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-900">Active Sessions</h2>
          <div className="mt-4 space-y-3">
            {accounts.slice(0, 5).map((account) => (
              <div key={account._id} className="flex items-center justify-between rounded-xl bg-white/70 p-4">
                <div>
                  <p className="font-medium text-slate-900">{account.name}</p>
                  <p className="text-xs text-slate-500">{account.phoneNumber || "Not linked"}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                      accountTone[account.status] || "bg-slate-100 text-slate-700"
                    }`}
                  >
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
  );
}

export default DashboardPage;
