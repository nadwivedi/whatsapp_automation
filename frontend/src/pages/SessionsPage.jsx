import { accountTone } from "../utils/tones";

function SessionsPage({
  refreshing,
  refreshAll,
  accountForm,
  setAccountForm,
  createAccount,
  busy,
  accounts,
  accountAction,
  showQr,
  removeAccount,
  dailyDrafts,
  setDailyDrafts,
  updateDailyLimit,
  dashboardLoading,
  qrPreview,
  refreshQrPreview,
  setQrPreview,
}) {
  return (
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
          <input
            className="input"
            placeholder="Session name (optional)"
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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((account) => (
          <div key={account._id} className="glass-panel rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-heading text-lg font-semibold text-slate-900">{account.name}</p>
                <p className="text-sm text-slate-500">{account.phoneNumber || "Not linked yet"}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                  accountTone[account.status] || "bg-slate-100 text-slate-700"
                }`}
              >
                {account.status}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
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
                onClick={() => removeAccount(account)}
                disabled={busy === `delete-${account._id}`}
              >
                {busy === `delete-${account._id}` ? "Deleting..." : "Delete"}
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[130px_120px_120px] sm:items-center">
              <p className="text-xs text-slate-500">Sent today: {account.sentToday}</p>
              <input
                className="input text-xs"
                type="number"
                min="1"
                max="500"
                value={dailyDrafts[account._id] ?? account.dailyLimit}
                onChange={(e) =>
                  setDailyDrafts((prev) => ({
                    ...prev,
                    [account._id]: e.target.value,
                  }))
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
            {account.lastError && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{account.lastError}</p>
            )}
          </div>
        ))}
        {accounts.length === 0 && !dashboardLoading && <p className="empty col-span-2">No sessions yet.</p>}
      </div>

      {qrPreview && (
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-xl font-semibold text-slate-900">QR Preview</h3>
              <p className="text-sm text-slate-600">
                {qrPreview.accountName} • {qrPreview.status}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-dark" onClick={refreshQrPreview}>
                Refresh QR
              </button>
              <button type="button" className="btn-dark" onClick={() => setQrPreview(null)}>
                Close
              </button>
            </div>
          </div>
          <div className="mt-4">
            {qrPreview.qrCodeDataUrl ? (
              <img
                src={qrPreview.qrCodeDataUrl}
                alt="WhatsApp QR"
                className="h-56 w-56 rounded-2xl border-4 border-white shadow-lg"
              />
            ) : (
              <p className="empty">QR not available yet.</p>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

export default SessionsPage;
