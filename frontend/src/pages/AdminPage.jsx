import { useState, useEffect } from "react";
import { formatDate } from "../utils/formatters";

function AdminPage({
  users,
  usersLoading,
  loadUsers,
  createUser,
  resetUserPassword,
  toggleUser,
  updateUser,
  deleteUser,
  securityAlerts,
  loadSecurityAlerts,
  busy,
  setNotice,
}) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [showResetPopup, setShowResetPopup] = useState(false);
  const [showEditPopup, setShowEditPopup] = useState(false);
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
  const [editUserForm, setEditUserForm] = useState({
    name: "",
    email: "",
    mobileNumber: "",
    role: "member",
  });

  useEffect(() => {
    loadUsers();
    loadSecurityAlerts();
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

  async function handleUpdateUser(e) {
    e.preventDefault();
    const ok = await updateUser(selectedUser._id, editUserForm);
    if (ok) {
      setShowEditPopup(false);
    }
  }

  async function handleDeleteUser(userId) {
    await deleteUser(userId);
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div>
          <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.2em] text-slate-500">Administrative</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">User Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-cyan" onClick={() => setShowCreatePopup(true)}>
            Create New User
          </button>
          <button 
            className="btn-dark px-3 py-2 flex items-center gap-2" 
            onClick={() => { loadUsers(); loadSecurityAlerts(); }}
            disabled={usersLoading}
          >
            {usersLoading ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : "Refresh"}
          </button>
        </div>
      </header>

      {/* Security Alerts Section */}
      {securityAlerts && securityAlerts.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-rose-500 rounded-lg p-2 shadow-lg shadow-rose-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-rose-900">Security Alerts</h2>
              <p className="text-sm text-rose-600">Recent failed login attempts detected</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {securityAlerts.map((alert) => (
              <div key={alert._id} className="flex flex-col gap-1 rounded-xl bg-white px-4 py-3 border border-rose-100 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{alert.ip}</span>
                  <span className="text-[10px] uppercase font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded">FAILED</span>
                </div>
                <div className="text-xs text-slate-500 truncate">
                  Attempted: <span className="font-medium text-slate-700">{alert.mobileNumber || "Unknown"}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {new Date(alert.attemptedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                        setEditUserForm({
                          name: user.name,
                          email: user.email || "",
                          mobileNumber: user.mobileNumber,
                          role: user.role,
                        });
                        setShowEditPopup(true);
                      }}
                    >
                      Edit
                    </button>
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
                    <button
                      className="text-rose-600 hover:text-rose-700 font-medium"
                      onClick={() => handleDeleteUser(user._id)}
                      disabled={busy === `delete-user-${user._id}`}
                    >
                      Delete
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

      {/* Edit User Popup */}
      {showEditPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowEditPopup(false)}>
          <div className="glass-panel w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-slate-900">Edit User</h2>
              <button onClick={() => setShowEditPopup(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Full Name</label>
                <input
                  required
                  className="input w-full"
                  value={editUserForm.name}
                  onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Mobile Number</label>
                  <input
                    required
                    className="input w-full"
                    value={editUserForm.mobileNumber}
                    onChange={(e) => setEditUserForm({ ...editUserForm, mobileNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    className="input w-full"
                    value={editUserForm.email}
                    onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Role</label>
                <select
                  className="input w-full"
                  value={editUserForm.role}
                  onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn-cyan w-full py-3" disabled={busy === `update-user-${selectedUser?._id}`}>
                {busy === `update-user-${selectedUser?._id}` ? "Updating..." : "Update User"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminPage;
