import { useMemo, useState } from "react";
import { formatDate } from "../utils/formatters";

function SettingsPage({ settings, accounts, busy, saveSettings, refreshAll, refreshing }) {
  const [form, setForm] = useState(() => ({
    perMobileDailyLimit: String(settings?.perMobileDailyLimit || 20),
    perMobileHourlyLimit: String(settings?.perMobileHourlyLimit || 2),
  }));
  const [validationError, setValidationError] = useState("");

  const activeConnectedAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.isActive !== false && account.status === "authenticated",
      ),
    [accounts],
  );

  const preview = useMemo(() => {
    const dailyLimit = Number(form.perMobileDailyLimit);
    const hourlyLimit = Number(form.perMobileHourlyLimit);

    if (!Number.isFinite(dailyLimit) || !Number.isFinite(hourlyLimit) || dailyLimit < 1 || hourlyLimit < 1) {
      return {
        dailyLimit: 0,
        hourlyLimit: 0,
        activeConnectedCount: activeConnectedAccounts.length,
        maxMessagesNext24Hours: 0,
        maxMessagesNextHour: 0,
        remainingMessagesToday: 0,
        remainingMessagesThisHour: 0,
      };
    }

    const remainingMessagesToday = activeConnectedAccounts.reduce((sum, account) => {
      const accountDailyLimit = Number.isFinite(account.dailyLimit) ? account.dailyLimit : dailyLimit;
      const effectiveDailyLimit = Math.min(dailyLimit, accountDailyLimit);
      const sentToday = Number(account.sentToday) || 0;
      return sum + Math.max(0, effectiveDailyLimit - sentToday);
    }, 0);

    const remainingMessagesThisHour = activeConnectedAccounts.reduce((sum, account) => {
      const sentThisHour = Number(account.sentThisHour) || 0;
      return sum + Math.max(0, hourlyLimit - sentThisHour);
    }, 0);

    return {
      dailyLimit,
      hourlyLimit,
      activeConnectedCount: activeConnectedAccounts.length,
      maxMessagesNext24Hours: activeConnectedAccounts.length * dailyLimit,
      maxMessagesNextHour: activeConnectedAccounts.length * hourlyLimit,
      remainingMessagesToday,
      remainingMessagesThisHour,
    };
  }, [activeConnectedAccounts, form.perMobileDailyLimit, form.perMobileHourlyLimit]);

  async function onSubmit(e) {
    e.preventDefault();
    const dailyLimit = Number(form.perMobileDailyLimit);
    const hourlyLimit = Number(form.perMobileHourlyLimit);

    if (!Number.isFinite(dailyLimit) || dailyLimit < 1 || dailyLimit > 500) {
      setValidationError("Per mobile/day limit must be between 1 and 500.");
      return;
    }
    if (!Number.isFinite(hourlyLimit) || hourlyLimit < 1 || hourlyLimit > 100) {
      setValidationError("Per mobile/hour limit must be between 1 and 100.");
      return;
    }

    setValidationError("");
    await saveSettings({
      perMobileDailyLimit: Math.floor(dailyLimit),
      perMobileHourlyLimit: Math.floor(hourlyLimit),
    });
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.25em] text-slate-500">Control</p>
          <h1 className="font-heading text-3xl font-bold text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Define global limits per mobile/account and monitor available sending capacity.
          </p>
        </div>
        <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Connected Accounts</p>
          <p className="mt-2 font-heading text-4xl font-bold text-slate-900">{preview.activeConnectedCount}</p>
          <p className="mt-1 text-xs text-slate-500">Only active authenticated sessions are counted.</p>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Available Next Hour</p>
          <p className="mt-2 font-heading text-4xl font-bold text-slate-900">{preview.maxMessagesNextHour}</p>
          <p className="mt-1 text-xs text-slate-500">Current remaining: {preview.remainingMessagesThisHour}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Available Next 24 Hours</p>
          <p className="mt-2 font-heading text-4xl font-bold text-slate-900">{preview.maxMessagesNext24Hours}</p>
          <p className="mt-1 text-xs text-slate-500">Current remaining today: {preview.remainingMessagesToday}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last Updated</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(settings?.updatedAt)}</p>
          <p className="mt-1 text-xs text-slate-500">Changes apply to new queue decisions immediately.</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Message Limits</h2>
        <p className="mt-1 text-sm text-slate-500">
          Example: if you set 20/day and have 10 connected accounts, available messages in the next 24 hours = 200.
        </p>

        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Messages Per Mobile Per Day
            </span>
            <input
              className="input"
              type="number"
              min="1"
              max="500"
              value={form.perMobileDailyLimit}
              onChange={(e) => setForm((prev) => ({ ...prev, perMobileDailyLimit: e.target.value }))}
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Messages Per Mobile Per Hour
            </span>
            <input
              className="input"
              type="number"
              min="1"
              max="100"
              value={form.perMobileHourlyLimit}
              onChange={(e) => setForm((prev) => ({ ...prev, perMobileHourlyLimit: e.target.value }))}
              required
            />
          </label>

          {validationError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 md:col-span-2">
              {validationError}
            </p>
          )}

          <div className="md:col-span-2">
            <button className="btn-cyan" disabled={busy === "save-settings"}>
              {busy === "save-settings" ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default SettingsPage;
