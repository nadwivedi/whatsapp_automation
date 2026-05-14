import { useState } from "react";

function AdminLoginPage({ authBusy, submitAuth, notice }) {
  const [adminAuthForm, setAdminAuthForm] = useState({ mobileNumber: "", password: "" });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Pass the local form state to the submitAuth function
    submitAuth(e, adminAuthForm);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#f8fafc] px-4 py-6 sm:py-10">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8 shadow-2xl border border-white/50">
        <div className="text-center mb-8">
            <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.3em] text-slate-500">Secured Access</p>
            <h1 className="font-heading mt-2 text-3xl font-bold text-slate-900">Admin Login</h1>
            <div className="h-1 w-12 bg-cyan-500 mx-auto mt-4 rounded-full"></div>
        </div>
        
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
              Mobile Number
            </label>
            <input
              className="input w-full bg-slate-50/50 border-slate-200 focus:border-cyan-500 focus:ring-cyan-500/10"
              placeholder="Enter admin mobile"
              value={adminAuthForm.mobileNumber}
              onChange={(e) => setAdminAuthForm((p) => ({ ...p, mobileNumber: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
              Password
            </label>
            <input
              className="input w-full bg-slate-50/50 border-slate-200 focus:border-cyan-500 focus:ring-cyan-500/10"
              type="password"
              placeholder="••••••••"
              value={adminAuthForm.password}
              onChange={(e) => setAdminAuthForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
          </div>
          <button className="btn-cyan w-full py-4 text-sm font-bold tracking-wide shadow-lg shadow-cyan-500/20" disabled={authBusy}>
            {authBusy ? "Authenticating..." : "Sign In to Admin Panel"}
          </button>
        </form>
        
        {notice && (
          <div
            className={`mt-6 rounded-2xl px-4 py-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
              notice.type === "error" ? "bg-rose-50 text-rose-700 border border-rose-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
            }`}
          >
            {notice.text}
          </div>
        )}
        
        <p className="mt-8 text-center text-[10px] text-slate-400 font-medium uppercase tracking-widest">
            © {new Date().getFullYear()} WhatsApp Automation System
        </p>
      </div>
    </div>
  );
}

export default AdminLoginPage;
