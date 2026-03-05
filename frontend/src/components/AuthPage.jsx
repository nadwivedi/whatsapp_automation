function AuthPage({ authMode, authBusy, authForm, setAuthMode, setAuthForm, submitAuth, notice }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-6 sm:py-10">
      <div className="glass-panel w-full max-w-xl rounded-2xl sm:rounded-3xl p-5 sm:p-8">
        <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.22em] text-slate-500">WhatsApp System</p>
        <h1 className="font-heading mt-2 text-2xl sm:text-3xl text-slate-900">
          {authMode === "login" ? "Login" : "Create Account"}
        </h1>
        <form className="mt-4 sm:mt-5 space-y-3" onSubmit={submitAuth}>
          {authMode === "register" && (
            <input
              className="input"
              placeholder="Full name"
              value={authForm.name}
              onChange={(e) => setAuthForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          )}
          <input
            className="input"
            placeholder="Mobile number"
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
          <button className="btn-cyan w-full" disabled={authBusy}>
            {authBusy ? "Please wait..." : authMode === "login" ? "Login" : "Register"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-xs sm:text-sm font-semibold text-cyan-700 hover:text-cyan-600"
          onClick={() => setAuthMode((p) => (p === "login" ? "register" : "login"))}
        >
          {authMode === "login" ? "Need an account? Register" : "Already have an account? Login"}
        </button>
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
