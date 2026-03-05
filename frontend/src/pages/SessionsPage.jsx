import { useMemo, useState } from "react";
import { accountTone } from "../utils/tones";
import { formatDate } from "../utils/formatters";

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
  const [showCreatePopup, setShowCreatePopup] = useState(false);

  const autoSessionName = useMemo(() => {
    const clean = (accountForm.phoneNumber || "").replace(/[^\d+]/g, "").trim();
    return clean ? `WA ${clean}` : "WA xxxxxxxxxx";
  }, [accountForm.phoneNumber]);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-heading text-sm uppercase tracking-[0.2em] text-slate-500">Manage</p>
          <h1 className="font-heading text-3xl font-bold text-slate-900">Sessions</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-cyan" onClick={() => setShowCreatePopup(true)}>
            Create Session
          </button>
          <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((account) => {
          const isSessionRunning = ["initializing", "qr_ready", "authenticated"].includes(account.status);

          return (
            <div key={account._id} className="glass-panel rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-lg font-semibold text-slate-900">{account.name}</p>
                  <p className="text-sm text-slate-500">{account.phoneNumber || "Not linked yet"}</p>
                  <p className="text-xs text-slate-500">
                    Last connected: {account.lastConnectedAt ? formatDate(account.lastConnectedAt) : "Never"}
                  </p>
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
                {!isSessionRunning && (
                  <button
                    type="button"
                    className="btn-green"
                    onClick={() => accountAction(account._id, "start")}
                    disabled={busy === `start-${account._id}`}
                  >
                    {busy === `start-${account._id}` ? "Starting..." : "Start Session"}
                  </button>
                )}
                {isSessionRunning && (
                  <button
                    type="button"
                    className="btn-red"
                    onClick={() => accountAction(account._id, "stop")}
                    disabled={busy === `stop-${account._id}`}
                  >
                    {busy === `stop-${account._id}` ? "Stopping..." : "Stop Session"}
                  </button>
                )}
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
          );
        })}

        {accounts.length === 0 && !dashboardLoading && <p className="empty col-span-2">No sessions yet.</p>}
      </div>

      {showCreatePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowCreatePopup(false)}>
          <div className="glass-panel w-full max-w-lg rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-xl font-semibold text-slate-900">Create Session</h3>
                <p className="text-sm text-slate-600">Session name will be auto-set from mobile number.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setShowCreatePopup(false)}
                aria-label="Close create session popup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form
              className="mt-4 grid gap-3"
              onSubmit={async (e) => {
                await createAccount(e);
                if (busy !== "create-account") {
                  setShowCreatePopup(false);
                }
              }}
            >
              <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                Session Name: <span className="font-semibold">{autoSessionName}</span>
              </div>
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
        </div>
      )}

      {qrPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setQrPreview(null)}>
          <div className="glass-panel w-full max-w-md rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-xl font-semibold text-slate-900">QR Preview</h3>
                <p className="text-sm text-slate-600">
                  {qrPreview.accountName} • {qrPreview.status}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setQrPreview(null)}
                aria-label="Close QR popup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="mt-4 flex flex-col items-center gap-4">
              {qrPreview.qrCodeDataUrl ? (
                <img
                  src={qrPreview.qrCodeDataUrl}
                  alt="WhatsApp QR"
                  className="h-64 w-64 rounded-2xl border-4 border-white shadow-lg"
                />
              ) : (
                <p className="empty w-full">QR not available yet.</p>
              )}
              <button type="button" className="btn-dark" onClick={refreshQrPreview}>
                Refresh QR
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SessionsPage;
