import { NAV_ITEMS } from "../router/routes";

function AppShell({
  profile,
  notice,
  mobileMenuOpen,
  setMobileMenuOpen,
  activeRoute,
  onNavigate,
  logout,
  onMessagesRouteOpen,
  children,
}) {
  return (
    <div className="min-h-screen">
      <aside
        className={`fixed left-0 top-0 z-50 h-screen w-[17rem] sm:w-64 transform bg-white/80 shadow-2xl backdrop-blur-xl transition-transform duration-300 lg:w-52 lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col border-r border-white/50 p-4 sm:p-5">
          <div className="mb-4 sm:mb-6 flex items-center justify-between">
            <div>
              <p className="font-heading text-xs uppercase tracking-[0.2em] text-slate-500">WhatsApp</p>
              <h1 className="font-heading text-lg sm:text-xl font-bold text-slate-900">msgsender</h1>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 sm:mb-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 p-3 sm:p-4 text-white">
            <p className="text-[11px] sm:text-xs opacity-80">Welcome back,</p>
            <p className="font-heading text-base sm:text-lg font-semibold">{profile?.user?.name || "User"}</p>
            <p className="mt-1 text-[11px] sm:text-xs opacity-80">{profile?.user?.mobileNumber || "--"}</p>
          </div>

          <nav className="flex-1 space-y-1.5 sm:space-y-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onNavigate(item.path);
                  setMobileMenuOpen(false);
                  if (item.key === "messages") onMessagesRouteOpen();
                }}
                className={`flex w-full items-center gap-2 sm:gap-3 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-left text-sm sm:text-[15px] lg:text-[13px] font-medium transition-all duration-200 ${
                  activeRoute === item.key
                    ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/25"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/10 text-[10px] font-semibold">
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-3 sm:pt-4">
            <button
              type="button"
              onClick={() => {
                logout();
                setMobileMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 sm:gap-3 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-[15px] lg:text-[13px] font-medium text-rose-600 transition hover:bg-rose-50"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-[10px] font-semibold">
                OUT
              </span>
              Logout
            </button>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <main className="min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:ml-52 lg:px-6 lg:py-6">
        <div className="mb-3 sm:mb-4 flex items-center lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="mr-3 sm:mr-4 rounded-lg bg-slate-900 p-1.5 sm:p-2 text-white"
          >
            <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="font-heading text-lg sm:text-xl font-bold text-slate-900">msgsender</h1>
        </div>

        {notice && (
          <div
            className={`fixed right-3 top-3 sm:right-6 sm:top-6 z-50 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm font-medium shadow-lg ${
              notice.type === "error" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {notice.text}
          </div>
        )}

        {children}
      </main>
    </div>
  );
}

export default AppShell;
