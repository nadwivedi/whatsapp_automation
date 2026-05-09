import { useState, useEffect } from "react";
import { formatDate } from "../utils/formatters";

function AdminPage({
  users,
  usersLoading,
  loadUsers,
  createUser,
  resetUserPassword,
  toggleUser,
  busy,
  setNotice,
}) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [showResetPopup, setShowResetPopup] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    mobileNumber: "",
    password: "",
    role: "member",
  });
  const [resetPasswordForm, setResetPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreateUser(e) {
    e.preventDefault();
    const ok = await createUser(newUserForm);
    if (ok) {
      setShowCreatePopup(false);
      setNewUserForm({
        name: "",
        email: "",
        mobileNumber: "",
        password: "",
        role: "member",
      });
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword) {
      setNotice({ type: "error", text: "Passwords do not match." });
      return;
    }
    const ok = await resetUserPassword(selectedUser._id, resetPasswordForm.newPassword);
    if (ok) {
      setShowResetPopup(false);
      setResetPasswordForm({ newPassword: "", confirmPassword: "" });
    }
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div>
          <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.2em] text-slate-500">System</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">Admin Dashboard</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-cyan" onClick={() => setShowCreatePopup(true)}>
            Create User
          </button>
          <button className="btn-dark" onClick={loadUsers} disabled={usersLoading}>
            {usersLoading ? "Refreshing..." : "Refresh Users"}
          </button>
        </div>
      </header>

      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-3 font-semibold text-slate-700">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Mobile</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Role</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                  <td className="px-4 py-3 text-slate-600">{user.mobileNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 ${user.isActive ? "text-emerald-600" : "text-rose-600"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      className="text-cyan-600 hover:text-cyan-700 font-medium"
                      onClick={() => {
                        setSelectedUser(user);
                        setShowResetPopup(true);
                      }}
                    >
                      Reset Password
                    </button>
                    <button
                      className={`${user.isActive ? "text-rose-600 hover:text-rose-700" : "text-emerald-600 hover:text-emerald-700"} font-medium`}
                      onClick={() => toggleUser(user._id)}
                      disabled={busy === `toggle-user-${user._id}`}
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && !usersLoading && (
          <div className="py-12 text-center text-slate-500">
            No users found.
          </div>
        )}
      </div>

      {/* Create User Popup */}
      {showCreatePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowCreatePopup(false)}>
          <div className="glass-panel w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-slate-900">Create New User</h2>
              <button onClick={() => setShowCreatePopup(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Full Name</label>
                <input
                  required
                  className="input w-full"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Mobile Number</label>
                  <input
                    required
                    className="input w-full"
                    placeholder="+91..."
                    value={newUserForm.mobileNumber}
                    onChange={(e) => setNewUserForm({ ...newUserForm, mobileNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    className="input w-full"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Password</label>
                <input
                  required
                  type="password"
                  className="input w-full"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Role</label>
                <select
                  className="input w-full"
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn-cyan w-full py-3" disabled={busy === "create-user"}>
                {busy === "create-user" ? "Creating..." : "Create User"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Popup */}
      {showResetPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowResetPopup(false)}>
          <div className="glass-panel w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-xl font-bold text-slate-900">Reset Password</h2>
                <p className="text-sm text-slate-500">For {selectedUser?.name}</p>
              </div>
              <button onClick={() => setShowResetPopup(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">New Password</label>
                <input
                  required
                  type="password"
                  className="input w-full"
                  value={resetPasswordForm.newPassword}
                  onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, newPassword: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Confirm New Password</label>
                <input
                  required
                  type="password"
                  className="input w-full"
                  value={resetPasswordForm.confirmPassword}
                  onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, confirmPassword: e.target.value })}
                />
              </div>
              <button type="submit" className="btn-cyan w-full py-3" disabled={busy === `reset-password-${selectedUser?._id}`}>
                {busy === `reset-password-${selectedUser?._id}` ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminPage;
