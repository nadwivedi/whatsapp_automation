function AuthPage({ authMode, authBusy, authForm, setAuthMode, setAuthForm, submitAuth, notice }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-6 sm:py-10">
      <div className="glass-panel w-full max-w-xl rounded-2xl sm:rounded-3xl p-5 sm:p-8">
        <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.22em] text-slate-500">WhatsApp System</p>
        <h1 className="font-heading mt-2 text-2xl sm:text-3xl text-slate-900">
          Login
        </h1>
        <form className="mt-4 sm:mt-5 space-y-3" onSubmit={submitAuth}>
          <input
            className="input"
            placeholder="Mobile number or Email"
            value={authForm.mobileNumber}
            onChange={(e) => setAuthForm((p) => ({ ...p, mobileNumber: e.target.value }))}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={authForm.password}
            onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
            required
          />
          <button className="btn-cyan w-full py-3 shadow-lg shadow-cyan-500/20" disabled={authBusy}>
            {authBusy ? "Authenticating..." : "Login to Account"}
          </button>
        </form>
        {notice && (
          <div
            className={`mt-4 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-medium ${
              notice.type === "error" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {notice.text}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthPage;
