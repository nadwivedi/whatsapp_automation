import { useMemo, useState } from "react";
import { formatDate } from "../utils/formatters";

function SettingsPage({ settings, accounts, busy, saveSettings, refreshAll, refreshing }) {
  const [form, setForm] = useState(() => ({
    perMobileDailyLimit: String(settings?.perMobileDailyLimit || 20),
    perMobileHourlyLimit: String(settings?.perMobileHourlyLimit || 2),
  }));
  const [validationError, setValidationError] = useState("");

  // Anti-Bot form state (Phase 1 + Phase 2)
  const [antiBotForm, setAntiBotForm] = useState(() => ({
    antiBotEnabled: settings?.antiBotEnabled ?? false,
    minDelayMs: String(settings?.minDelayMs ?? 5000),
    maxDelayMs: String(settings?.maxDelayMs ?? 15000),
    typingSimulation: settings?.typingSimulation ?? true,
    typingDurationMs: String(settings?.typingDurationMs ?? 3000),
    shuffleRecipients: settings?.shuffleRecipients ?? true,
    longPauseEnabled: settings?.longPauseEnabled ?? true,
    longPauseChance: String(settings?.longPauseChance ?? 0.1),
    longPauseMinMs: String(settings?.longPauseMinMs ?? 30000),
    longPauseMaxMs: String(settings?.longPauseMaxMs ?? 120000),
    // Phase 2
    messageSpinning: settings?.messageSpinning ?? true,
    businessHoursEnabled: settings?.businessHoursEnabled ?? false,
    businessHoursStart: String(settings?.businessHoursStart ?? 9),
    businessHoursEnd: String(settings?.businessHoursEnd ?? 21),
    warmUpEnabled: settings?.warmUpEnabled ?? false,
    warmUpDays: String(settings?.warmUpDays ?? 14),
    warmUpStartLimit: String(settings?.warmUpStartLimit ?? 3),
    readReceiptsBeforeSend: settings?.readReceiptsBeforeSend ?? true,
  }));
  const [antiBotError, setAntiBotError] = useState("");

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
        dailyLimit: 0, hourlyLimit: 0,
        activeConnectedCount: activeConnectedAccounts.length,
        maxMessagesNext24Hours: 0, maxMessagesNextHour: 0,
        remainingMessagesToday: 0, remainingMessagesThisHour: 0,
      };
    }

    const perAccountDailyCaps = activeConnectedAccounts.map((account) => {
      const raw = Number(account.dailyLimit);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : dailyLimit;
    });

    const remainingMessagesToday = activeConnectedAccounts.reduce((sum, account, i) => {
      return sum + Math.max(0, perAccountDailyCaps[i] - (Number(account.sentToday) || 0));
    }, 0);

    const remainingMessagesThisHour = activeConnectedAccounts.reduce((sum, account) => {
      return sum + Math.max(0, hourlyLimit - (Number(account.sentThisHour) || 0));
    }, 0);

    return {
      dailyLimit, hourlyLimit,
      activeConnectedCount: activeConnectedAccounts.length,
      maxMessagesNext24Hours: perAccountDailyCaps.reduce((s, c) => s + c, 0),
      maxMessagesNextHour: activeConnectedAccounts.length * hourlyLimit,
      remainingMessagesToday, remainingMessagesThisHour,
    };
  }, [activeConnectedAccounts, form.perMobileDailyLimit, form.perMobileHourlyLimit]);

  const perMobileHourlyStatus = useMemo(() => {
    const dailyLimit = Number(form.perMobileDailyLimit);
    const hourlyLimit = Number(form.perMobileHourlyLimit);
    const effectiveDailyLimit = Number.isFinite(dailyLimit) && dailyLimit > 0 ? Math.floor(dailyLimit) : 0;
    const effectiveHourlyLimit = Number.isFinite(hourlyLimit) && hourlyLimit > 0 ? Math.floor(hourlyLimit) : 0;

    return activeConnectedAccounts
      .map((account) => {
        const raw = Number(account.dailyLimit);
        const dailyCap = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : effectiveDailyLimit;
        const sentToday = Number(account.sentToday) || 0;
        const dayStartMs = account.dayWindowStart ? new Date(account.dayWindowStart).getTime() : 0;
        const dailyResetAtMs = dayStartMs + 24 * 60 * 60 * 1000;
        const sentThisHour = Number(account.sentThisHour) || 0;
        const remaining = Math.max(0, effectiveHourlyLimit - sentThisHour);
        const hourWindowStartMs = account.hourWindowStart ? new Date(account.hourWindowStart).getTime() : 0;
        const resetAtMs = hourWindowStartMs ? hourWindowStartMs + 60 * 60 * 1000 : 0;

        return {
          id: account._id,
          mobileLabel: account.phoneNumber || account.name || "Unknown mobile",
          sentToday, dailyCap,
          dailyRemaining: Math.max(0, dailyCap - sentToday),
          dailyWindowStartedLabel: dayStartMs ? formatDate(new Date(dayStartMs)) : "Starts after first send.",
          dailyResetLabel: dayStartMs && Number.isFinite(dailyResetAtMs) ? formatDate(new Date(dailyResetAtMs)) : "--",
          sentThisHour, limit: effectiveHourlyLimit, remaining,
          lastSentLabel: resetAtMs ? formatDate(new Date(hourWindowStartMs)) : "No message sent in current window.",
          resetLabel: resetAtMs ? formatDate(new Date(resetAtMs)) : "--",
          usagePercent: effectiveHourlyLimit > 0 ? Math.min(100, Math.round((sentThisHour / effectiveHourlyLimit) * 100)) : 0,
        };
      })
      .sort((a, b) => a.mobileLabel.localeCompare(b.mobileLabel));
  }, [activeConnectedAccounts, form.perMobileDailyLimit, form.perMobileHourlyLimit]);

  async function onSubmit(e) {
    e.preventDefault();
    const d = Number(form.perMobileDailyLimit);
    const h = Number(form.perMobileHourlyLimit);
    if (!Number.isFinite(d) || d < 1 || d > 500) { setValidationError("Per mobile/day limit must be between 1 and 500."); return; }
    if (!Number.isFinite(h) || h < 1 || h > 100) { setValidationError("Per mobile/hour limit must be between 1 and 100."); return; }
    setValidationError("");
    await saveSettings({ perMobileDailyLimit: Math.floor(d), perMobileHourlyLimit: Math.floor(h) });
  }

  async function onSaveAntiBot(e) {
    e.preventDefault();
    const minDelay = Number(antiBotForm.minDelayMs);
    const maxDelay = Number(antiBotForm.maxDelayMs);
    const typingDuration = Number(antiBotForm.typingDurationMs);
    const pauseChance = Number(antiBotForm.longPauseChance);
    const pauseMin = Number(antiBotForm.longPauseMinMs);
    const pauseMax = Number(antiBotForm.longPauseMaxMs);
    const bhStart = Number(antiBotForm.businessHoursStart);
    const bhEnd = Number(antiBotForm.businessHoursEnd);
    const wuDays = Number(antiBotForm.warmUpDays);
    const wuStart = Number(antiBotForm.warmUpStartLimit);

    if (antiBotForm.antiBotEnabled) {
      if (!Number.isFinite(minDelay) || minDelay < 2000 || minDelay > 60000) { setAntiBotError("Min delay: 2,000–60,000 ms."); return; }
      if (!Number.isFinite(maxDelay) || maxDelay < 3000 || maxDelay > 120000) { setAntiBotError("Max delay: 3,000–120,000 ms."); return; }
      if (minDelay > maxDelay) { setAntiBotError("Min delay must be ≤ Max delay."); return; }
      if (!Number.isFinite(typingDuration) || typingDuration < 1000 || typingDuration > 10000) { setAntiBotError("Typing duration: 1,000–10,000 ms."); return; }
      if (!Number.isFinite(pauseChance) || pauseChance < 0 || pauseChance > 1) { setAntiBotError("Long pause chance: 0–1."); return; }
      if (!Number.isFinite(pauseMin) || pauseMin < 5000 || pauseMin > 300000) { setAntiBotError("Long pause min: 5,000–300,000 ms."); return; }
      if (!Number.isFinite(pauseMax) || pauseMax < 10000 || pauseMax > 600000) { setAntiBotError("Long pause max: 10,000–600,000 ms."); return; }
      if (pauseMin > pauseMax) { setAntiBotError("Long pause min must be ≤ max."); return; }
      if (!Number.isFinite(bhStart) || bhStart < 0 || bhStart > 23) { setAntiBotError("Business hours start: 0–23."); return; }
      if (!Number.isFinite(bhEnd) || bhEnd < 0 || bhEnd > 23) { setAntiBotError("Business hours end: 0–23."); return; }
      if (!Number.isFinite(wuDays) || wuDays < 1 || wuDays > 60) { setAntiBotError("Warm-up days: 1–60."); return; }
      if (!Number.isFinite(wuStart) || wuStart < 1 || wuStart > 50) { setAntiBotError("Warm-up start limit: 1–50."); return; }
    }

    setAntiBotError("");
    await saveSettings({
      antiBotEnabled: antiBotForm.antiBotEnabled,
      minDelayMs: Math.floor(minDelay),
      maxDelayMs: Math.floor(maxDelay),
      typingSimulation: antiBotForm.typingSimulation,
      typingDurationMs: Math.floor(typingDuration),
      shuffleRecipients: antiBotForm.shuffleRecipients,
      longPauseEnabled: antiBotForm.longPauseEnabled,
      longPauseChance: pauseChance,
      longPauseMinMs: Math.floor(pauseMin),
      longPauseMaxMs: Math.floor(pauseMax),
      messageSpinning: antiBotForm.messageSpinning,
      businessHoursEnabled: antiBotForm.businessHoursEnabled,
      businessHoursStart: Math.floor(bhStart),
      businessHoursEnd: Math.floor(bhEnd),
      warmUpEnabled: antiBotForm.warmUpEnabled,
      warmUpDays: Math.floor(wuDays),
      warmUpStartLimit: Math.floor(wuStart),
      readReceiptsBeforeSend: antiBotForm.readReceiptsBeforeSend,
    });
  }

  function formatMs(ms) {
    const seconds = ms / 1000;
    if (seconds >= 60) return `${(seconds / 60).toFixed(1)} min`;
    return `${seconds.toFixed(1)}s`;
  }

  // Toggle helper
  const Toggle = ({ value, onChange, size = "sm" }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${size === "lg" ? "h-7 w-12" : "h-6 w-10"
        } ${value ? "bg-emerald-500" : "bg-slate-400"}`}
    >
      <span className={`pointer-events-none inline-block transform rounded-full bg-white shadow transition-transform duration-200 ${size === "lg" ? "h-6 w-6" : "h-5 w-5"
        } ${value ? (size === "lg" ? "translate-x-5" : "translate-x-4") : "translate-x-0"}`} />
    </button>
  );

  return (
    <section className="space-y-5 sm:space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="glass-panel-dark group relative overflow-hidden rounded-2xl p-3 transition-transform hover:scale-[1.02] sm:p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-300/30 transition-transform group-hover:scale-150" />
          <p className="relative text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs">Available Next Hour</p>
          <p className="relative mt-1.5 font-heading text-2xl font-bold text-slate-900 sm:mt-2 sm:text-4xl">{preview.maxMessagesNextHour}</p>
          <p className="relative mt-1 text-[10px] leading-tight text-slate-600 sm:text-xs">Current remaining: {preview.remainingMessagesThisHour}</p>
        </div>
        <div className="glass-panel-dark group relative overflow-hidden rounded-2xl p-3 transition-transform hover:scale-[1.02] sm:p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-amber-300/30 transition-transform group-hover:scale-150" />
          <p className="relative text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs">Available Next 24 Hours</p>
          <p className="relative mt-1.5 font-heading text-2xl font-bold text-slate-900 sm:mt-2 sm:text-4xl">{preview.maxMessagesNext24Hours}</p>
          <p className="relative mt-1 text-[10px] leading-tight text-slate-600 sm:text-xs">Current remaining today: {preview.remainingMessagesToday}</p>
        </div>
        <div className="glass-panel-dark group relative overflow-hidden rounded-2xl p-3 transition-transform hover:scale-[1.02] sm:p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-indigo-300/30 transition-transform group-hover:scale-150" />
          <div className="relative flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs">Last Updated</p>
            <button className="btn-dark shrink-0 text-[10px] px-2 py-1 sm:text-xs" onClick={refreshAll} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <p className="relative mt-1.5 text-sm font-semibold text-slate-900 sm:mt-2 sm:text-lg">{formatDate(settings?.updatedAt)}</p>
          <p className="relative mt-1 text-[10px] leading-tight text-slate-600 sm:text-xs">Changes apply to new queue decisions immediately.</p>
        </div>
      </div>

      {/* Message Limits */}
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
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-xs">Messages Per Mobile Per Day</span>
                <div className="relative mt-2">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <input className="input-dark pl-12" type="number" min="1" max="500" value={form.perMobileDailyLimit} onChange={(e) => setForm((p) => ({ ...p, perMobileDailyLimit: e.target.value }))} required />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500 sm:text-xs">Range: 1 - 500 messages</p>
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-xs">Messages Per Mobile Per Hour</span>
                <div className="relative mt-2">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <input className="input-dark pl-12" type="number" min="1" max="100" value={form.perMobileHourlyLimit} onChange={(e) => setForm((p) => ({ ...p, perMobileHourlyLimit: e.target.value }))} required />
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
                    <span className="text-xs font-semibold text-slate-900 sm:text-sm">{preview.maxMessagesNext24Hours}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-700 sm:text-sm">Hourly capacity</span>
                    <span className="text-xs font-semibold text-slate-900 sm:text-sm">{preview.activeConnectedCount} x {form.perMobileHourlyLimit}</span>
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
              {validationError && <p className="rounded-lg bg-rose-100 px-3 py-2 text-xs text-rose-700 sm:text-sm">{validationError}</p>}
              <div className="mt-4 flex items-center gap-3">
                <button className="btn-cyan flex-1" disabled={busy === "save-settings"}>
                  {busy === "save-settings" ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ── Anti-Bot Detection ── */}
      <div className="glass-panel-dark overflow-hidden rounded-2xl">
        <div className="border-b border-slate-300/80 bg-gradient-to-r from-slate-200/80 via-rose-100/60 to-amber-100/60 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">🛡️ Anti-Bot Detection</h2>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm">Make your messages look human-like to avoid WhatsApp flagging your account.</p>
            </div>
            <Toggle value={antiBotForm.antiBotEnabled} onChange={(v) => setAntiBotForm((p) => ({ ...p, antiBotEnabled: v }))} size="lg" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${antiBotForm.antiBotEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
              <span className={`h-2 w-2 rounded-full ${antiBotForm.antiBotEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
              {antiBotForm.antiBotEnabled ? "Protection Active" : "Protection Off"}
            </span>
          </div>
        </div>

        <form className="p-4 sm:p-6" onSubmit={onSaveAntiBot}>
          <div className={`space-y-5 ${!antiBotForm.antiBotEnabled ? "opacity-50 pointer-events-none" : ""}`}>

            {/* ── PHASE 1 ── */}
            {/* Random Delay */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">⏱️ Random Delay Per Account</h3>
              <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">Each account waits a random time (min–max) before its next message. Other accounts are not affected.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Min Delay (ms)</span>
                  <input className="input-dark mt-1" type="number" min="2000" max="60000" step="1000" value={antiBotForm.minDelayMs} onChange={(e) => setAntiBotForm((p) => ({ ...p, minDelayMs: e.target.value }))} />
                  <p className="mt-1 text-[10px] text-slate-500">Currently: {formatMs(Number(antiBotForm.minDelayMs) || 5000)}</p>
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Max Delay (ms)</span>
                  <input className="input-dark mt-1" type="number" min="3000" max="120000" step="1000" value={antiBotForm.maxDelayMs} onChange={(e) => setAntiBotForm((p) => ({ ...p, maxDelayMs: e.target.value }))} />
                  <p className="mt-1 text-[10px] text-slate-500">Currently: {formatMs(Number(antiBotForm.maxDelayMs) || 15000)}</p>
                </label>
              </div>
            </div>

            <div className="h-px bg-slate-300/70" />

            {/* Typing Simulation */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">⌨️ Typing Simulation</h3>
                  <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">Shows &quot;typing...&quot; to the recipient before the actual message is sent.</p>
                </div>
                <Toggle value={antiBotForm.typingSimulation} onChange={(v) => setAntiBotForm((p) => ({ ...p, typingSimulation: v }))} />
              </div>
              {antiBotForm.typingSimulation && (
                <label className="mt-3 block sm:w-1/2">
                  <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Typing Duration (ms)</span>
                  <input className="input-dark mt-1" type="number" min="1000" max="10000" step="500" value={antiBotForm.typingDurationMs} onChange={(e) => setAntiBotForm((p) => ({ ...p, typingDurationMs: e.target.value }))} />
                  <p className="mt-1 text-[10px] text-slate-500">Currently: {formatMs(Number(antiBotForm.typingDurationMs) || 3000)}</p>
                </label>
              )}
            </div>

            <div className="h-px bg-slate-300/70" />

            {/* Shuffle Recipients */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">🔀 Shuffle Recipients</h3>
                <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">Randomize the order messages are sent instead of going sequentially.</p>
              </div>
              <Toggle value={antiBotForm.shuffleRecipients} onChange={(v) => setAntiBotForm((p) => ({ ...p, shuffleRecipients: v }))} />
            </div>

            <div className="h-px bg-slate-300/70" />

            {/* Long Pause */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">☕ Occasional Long Pause</h3>
                  <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">Randomly takes a longer break to simulate coffee breaks, reading, etc.</p>
                </div>
                <Toggle value={antiBotForm.longPauseEnabled} onChange={(v) => setAntiBotForm((p) => ({ ...p, longPauseEnabled: v }))} />
              </div>
              {antiBotForm.longPauseEnabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Chance (0-1)</span>
                    <input className="input-dark mt-1" type="number" min="0" max="1" step="0.05" value={antiBotForm.longPauseChance} onChange={(e) => setAntiBotForm((p) => ({ ...p, longPauseChance: e.target.value }))} />
                    <p className="mt-1 text-[10px] text-slate-500">{Math.round(Number(antiBotForm.longPauseChance || 0) * 100)}% of messages</p>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Min Pause (ms)</span>
                    <input className="input-dark mt-1" type="number" min="5000" max="300000" step="5000" value={antiBotForm.longPauseMinMs} onChange={(e) => setAntiBotForm((p) => ({ ...p, longPauseMinMs: e.target.value }))} />
                    <p className="mt-1 text-[10px] text-slate-500">{formatMs(Number(antiBotForm.longPauseMinMs) || 30000)}</p>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Max Pause (ms)</span>
                    <input className="input-dark mt-1" type="number" min="10000" max="600000" step="5000" value={antiBotForm.longPauseMaxMs} onChange={(e) => setAntiBotForm((p) => ({ ...p, longPauseMaxMs: e.target.value }))} />
                    <p className="mt-1 text-[10px] text-slate-500">{formatMs(Number(antiBotForm.longPauseMaxMs) || 120000)}</p>
                  </label>
                </div>
              )}
            </div>

            <div className="h-px bg-slate-300/70" />

            {/* ── PHASE 2 ── */}
            <div className="rounded-lg bg-gradient-to-r from-violet-100/50 to-rose-100/50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700 sm:text-xs">Advanced Protection</p>
            </div>

            {/* Message Spinning */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">🎰 Message Text Spinning</h3>
                <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">
                  Use <code className="rounded bg-slate-200 px-1 text-[10px]">{"{Hi|Hello|Hey}"}</code> syntax in templates. Each message gets a random variant so no two are identical.
                </p>
              </div>
              <Toggle value={antiBotForm.messageSpinning} onChange={(v) => setAntiBotForm((p) => ({ ...p, messageSpinning: v }))} />
            </div>

            <div className="h-px bg-slate-300/70" />

            {/* Read Receipts */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">👁️ Read Receipts Before Send</h3>
                <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">
                  Marks the chat as &quot;read&quot; before sending your message, mimicking how a real user reads first then replies.
                </p>
              </div>
              <Toggle value={antiBotForm.readReceiptsBeforeSend} onChange={(v) => setAntiBotForm((p) => ({ ...p, readReceiptsBeforeSend: v }))} />
            </div>

            <div className="h-px bg-slate-300/70" />

            {/* Business Hours */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">🕘 Business Hours Only</h3>
                  <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">
                    Only send messages during realistic hours. Sending at 3am looks suspicious.
                  </p>
                </div>
                <Toggle value={antiBotForm.businessHoursEnabled} onChange={(v) => setAntiBotForm((p) => ({ ...p, businessHoursEnabled: v }))} />
              </div>
              {antiBotForm.businessHoursEnabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Start Hour (0–23)</span>
                    <input className="input-dark mt-1" type="number" min="0" max="23" value={antiBotForm.businessHoursStart} onChange={(e) => setAntiBotForm((p) => ({ ...p, businessHoursStart: e.target.value }))} />
                    <p className="mt-1 text-[10px] text-slate-500">{Number(antiBotForm.businessHoursStart || 9)}:00</p>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">End Hour (0–23)</span>
                    <input className="input-dark mt-1" type="number" min="0" max="23" value={antiBotForm.businessHoursEnd} onChange={(e) => setAntiBotForm((p) => ({ ...p, businessHoursEnd: e.target.value }))} />
                    <p className="mt-1 text-[10px] text-slate-500">{Number(antiBotForm.businessHoursEnd || 21)}:00</p>
                  </label>
                </div>
              )}
            </div>

            <div className="h-px bg-slate-300/70" />

            {/* Account Warm-Up */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">🌡️ Account Warm-Up</h3>
                  <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">
                    New accounts start with a low daily limit and gradually increase over time. Prevents new numbers from being flagged for sudden high volume.
                  </p>
                </div>
                <Toggle value={antiBotForm.warmUpEnabled} onChange={(v) => setAntiBotForm((p) => ({ ...p, warmUpEnabled: v }))} />
              </div>
              {antiBotForm.warmUpEnabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Warm-Up Period (days)</span>
                    <input className="input-dark mt-1" type="number" min="1" max="60" value={antiBotForm.warmUpDays} onChange={(e) => setAntiBotForm((p) => ({ ...p, warmUpDays: e.target.value }))} />
                    <p className="mt-1 text-[10px] text-slate-500">Daily limit ramps up over {antiBotForm.warmUpDays} days</p>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">Start Limit (msgs/day)</span>
                    <input className="input-dark mt-1" type="number" min="1" max="50" value={antiBotForm.warmUpStartLimit} onChange={(e) => setAntiBotForm((p) => ({ ...p, warmUpStartLimit: e.target.value }))} />
                    <p className="mt-1 text-[10px] text-slate-500">Day 1: {antiBotForm.warmUpStartLimit} msgs → Day {antiBotForm.warmUpDays}: {form.perMobileDailyLimit} msgs</p>
                  </label>
                </div>
              )}
            </div>
          </div>

          {antiBotError && (
            <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-xs text-rose-700 sm:text-sm">{antiBotError}</p>
          )}

          <div className="mt-5">
            <button className="btn-cyan" disabled={busy === "save-settings"}>
              {busy === "save-settings" ? "Saving..." : "Save Anti-Bot Settings"}
            </button>
          </div>
        </form>
      </div>

      {/* Limit Window by Mobile */}
      <div className="glass-panel-dark overflow-hidden rounded-2xl">
        <div className="border-b border-slate-300/80 bg-gradient-to-r from-slate-200/80 via-emerald-100/70 to-cyan-100/70 px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">Limit Window by Mobile</h2>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">Daily reset = first send in window + 24 hours. Hourly reset = last sent + 1 hour.</p>
        </div>
        <div className="p-4 sm:p-6">
          {!perMobileHourlyStatus.length ? (
            <p className="rounded-xl border border-slate-300/70 bg-slate-200/60 px-3 py-3 text-xs text-slate-600 sm:text-sm">No active authenticated mobile sessions found.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {perMobileHourlyStatus.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-300/80 bg-slate-200/65 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-heading text-xs font-semibold text-slate-800 sm:text-sm">{item.mobileLabel}</p>
                    <span className="rounded-full bg-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700 sm:text-xs">{item.sentThisHour}/{item.limit}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-300/90">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-emerald-600" style={{ width: `${item.usagePercent}%` }} />
                  </div>
                  <div className="mt-2 space-y-1 text-[10px] text-slate-600 sm:text-xs">
                    <p>Daily used: {item.sentToday}/{item.dailyCap}</p>
                    <p>Daily remaining: {item.dailyRemaining}</p>
                    <p>Daily window started: {item.dailyWindowStartedLabel}</p>
                    <p>Daily resets at: {item.dailyResetLabel}</p>
                    <p>Remaining this hour: {item.remaining}</p>
                    <p>Last sent at: {item.lastSentLabel}</p>
                    <p>Hourly resets at: {item.resetLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default SettingsPage;
