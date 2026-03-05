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
    <section className="space-y-5 sm:space-y-6">
      <header className="glass-panel-dark flex items-center justify-between gap-3 rounded-2xl px-4 py-4 sm:px-6 sm:py-5">
        <div>
          <p className="font-heading text-[10px] uppercase tracking-[0.25em] text-slate-500 sm:text-xs">Control</p>
          <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">Settings</h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Define global limits per mobile/account and monitor available sending capacity.
          </p>
        </div>
        <button className="btn-dark shrink-0" onClick={refreshAll} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="glass-panel-dark group relative overflow-hidden rounded-2xl p-3 transition-transform hover:scale-[1.02] sm:p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-cyan-300/30 transition-transform group-hover:scale-150" />
          <p className="relative text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs">Connected Accounts</p>
          <p className="relative mt-1.5 font-heading text-2xl font-bold text-slate-900 sm:mt-2 sm:text-4xl">{preview.activeConnectedCount}</p>
          <p className="relative mt-1 text-[10px] leading-tight text-slate-600 sm:text-xs">
            Only active authenticated sessions are counted.
          </p>
        </div>

        <div className="glass-panel-dark group relative overflow-hidden rounded-2xl p-3 transition-transform hover:scale-[1.02] sm:p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-300/30 transition-transform group-hover:scale-150" />
          <p className="relative text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs">Available Next Hour</p>
          <p className="relative mt-1.5 font-heading text-2xl font-bold text-slate-900 sm:mt-2 sm:text-4xl">{preview.maxMessagesNextHour}</p>
          <p className="relative mt-1 text-[10px] leading-tight text-slate-600 sm:text-xs">
            Current remaining: {preview.remainingMessagesThisHour}
          </p>
        </div>

        <div className="glass-panel-dark group relative overflow-hidden rounded-2xl p-3 transition-transform hover:scale-[1.02] sm:p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-amber-300/30 transition-transform group-hover:scale-150" />
          <p className="relative text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs">Available Next 24 Hours</p>
          <p className="relative mt-1.5 font-heading text-2xl font-bold text-slate-900 sm:mt-2 sm:text-4xl">{preview.maxMessagesNext24Hours}</p>
          <p className="relative mt-1 text-[10px] leading-tight text-slate-600 sm:text-xs">
            Current remaining today: {preview.remainingMessagesToday}
          </p>
        </div>

        <div className="glass-panel-dark group relative overflow-hidden rounded-2xl p-3 transition-transform hover:scale-[1.02] sm:p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-indigo-300/30 transition-transform group-hover:scale-150" />
          <p className="relative text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs">Last Updated</p>
          <p className="relative mt-1.5 text-sm font-semibold text-slate-900 sm:mt-2 sm:text-lg">{formatDate(settings?.updatedAt)}</p>
          <p className="relative mt-1 text-[10px] leading-tight text-slate-600 sm:text-xs">
            Changes apply to new queue decisions immediately.
          </p>
        </div>
      </div>

      <div className="glass-panel-dark overflow-hidden rounded-2xl">
        <div className="border-b border-slate-300/80 bg-gradient-to-r from-slate-200/80 via-cyan-100/70 to-emerald-100/70 px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">Message Limits</h2>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Example: if you set 20/day and have 10 connected accounts, available messages in the next 24 hours = 200.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <form className="grid gap-5 sm:gap-6 md:grid-cols-2" onSubmit={onSubmit}>
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
                  Messages Per Mobile Per Day
                </span>
                <div className="relative mt-2">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    className="input-dark pl-12"
                    type="number"
                    min="1"
                    max="500"
                    value={form.perMobileDailyLimit}
                    onChange={(e) => setForm((prev) => ({ ...prev, perMobileDailyLimit: e.target.value }))}
                    required
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500 sm:text-xs">Range: 1 - 500 messages</p>
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
                  Messages Per Mobile Per Hour
                </span>
                <div className="relative mt-2">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <input
                    className="input-dark pl-12"
                    type="number"
                    min="1"
                    max="100"
                    value={form.perMobileHourlyLimit}
                    onChange={(e) => setForm((prev) => ({ ...prev, perMobileHourlyLimit: e.target.value }))}
                    required
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500 sm:text-xs">Range: 1 - 100 messages</p>
              </label>
            </div>

            <div className="flex flex-col justify-between">
              <div className="rounded-xl border border-slate-300/80 bg-slate-200/70 p-4 sm:p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">Live Preview</p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-700 sm:text-sm">Daily capacity</span>
                    <span className="text-xs font-semibold text-slate-900 sm:text-sm">
                      {preview.activeConnectedCount} x {form.perMobileDailyLimit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-700 sm:text-sm">Hourly capacity</span>
                    <span className="text-xs font-semibold text-slate-900 sm:text-sm">
                      {preview.activeConnectedCount} x {form.perMobileHourlyLimit}
                    </span>
                  </div>
                  <div className="h-px bg-slate-300"></div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 sm:text-sm">24h capacity</span>
                    <span className="font-heading text-base font-bold text-cyan-700 sm:text-lg">{preview.maxMessagesNext24Hours}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 sm:text-sm">1h capacity</span>
                    <span className="font-heading text-base font-bold text-emerald-700 sm:text-lg">{preview.maxMessagesNextHour}</span>
                  </div>
                </div>
              </div>

              {validationError && (
                <p className="rounded-lg bg-rose-100 px-3 py-2 text-xs text-rose-700 sm:text-sm">
                  {validationError}
                </p>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button className="btn-cyan flex-1" disabled={busy === "save-settings"}>
                  {busy === "save-settings" ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

export default SettingsPage;
