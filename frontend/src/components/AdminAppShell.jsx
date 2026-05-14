import { ROUTES } from "../router/routes";

function AdminAppShell({
  profile,
  notice,
  mobileMenuOpen,
  setMobileMenuOpen,
  onNavigate,
  logout,
  children,
}) {
  const ADMIN_NAV = [
    { key: "admin", label: "User Management", icon: "👥", path: ROUTES.admin },
    { key: "settings", label: "System Settings", icon: "⚙️", path: ROUTES.settings },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      <aside
        className={`fixed left-0 top-0 z-50 h-screen w-[17rem] sm:w-64 transform bg-slate-800 shadow-2xl transition-transform duration-300 lg:w-56 lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col border-r border-slate-700 p-5">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="font-heading text-xs uppercase tracking-[0.3em] text-cyan-500 font-bold">Control Panel</p>
              <h1 className="font-heading text-xl font-bold text-white">Admin Console</h1>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 lg:hidden"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-6 rounded-2xl bg-slate-700/50 border border-slate-600 p-4 text-white">
            <p className="text-xs opacity-60 uppercase tracking-widest font-bold mb-1">Superuser</p>
            <p className="font-heading text-lg font-semibold truncate">{profile?.user?.name || "Admin"}</p>
          </div>

          <nav className="flex-1 space-y-2">
            {ADMIN_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onNavigate(item.path);
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all duration-200 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 text-lg shadow-inner">
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={() => {
                logout();
                setMobileMenuOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition shadow-lg shadow-red-900/40"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-[10px] font-bold">
                OUT
              </span>
              Exit Console
            </button>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <main className="min-h-screen px-4 py-4 lg:ml-56 lg:px-8 lg:py-8 bg-[#0f172a]">
        <div className="mb-6 flex items-center lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="mr-4 rounded-lg bg-slate-800 p-2 text-white border border-slate-700"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="font-heading text-xl font-bold text-white">Admin Console</h1>
        </div>

        {notice && (
          <div
            className={`fixed right-6 top-6 z-50 rounded-xl px-5 py-3 text-sm font-bold shadow-2xl border ${
              notice.type === "error" ? "bg-red-900/90 text-red-100 border-red-700" : "bg-emerald-900/90 text-emerald-100 border-emerald-700"
            } backdrop-blur-md`}
          >
            {notice.text}
          </div>
        )}

        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default AdminAppShell;
