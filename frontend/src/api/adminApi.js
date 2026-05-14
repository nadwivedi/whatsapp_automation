import { apiRequest } from "./client";

export async function listUsers(_token, onUnauthorized) {
  return apiRequest("/admin/users", { onUnauthorized });
}

export async function createUser(_token, payload, onUnauthorized) {
  return apiRequest("/admin/users", {
    options: {
      method: "POST",
      body: JSON.stringify(payload),
    },
    onUnauthorized,
  });
}

export async function resetPassword(_token, userId, newPassword, onUnauthorized) {
  return apiRequest("/admin/users/reset-password", {
    options: {
      method: "POST",
      body: JSON.stringify({ userId, newPassword }),
    },
    onUnauthorized,
  });
}

export async function toggleUserStatus(_token, userId, onUnauthorized) {
  return apiRequest(`/admin/users/${userId}/toggle-status`, {
    options: {
      method: "PATCH",
    },
    onUnauthorized,
  });
}

export async function updateUser(_token, userId, payload, onUnauthorized) {
  return apiRequest(`/admin/users/${userId}`, {
    options: {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    onUnauthorized,
  });
}

export async function deleteUser(_token, userId, onUnauthorized) {
  return apiRequest(`/admin/users/${userId}`, {
    options: {
      method: "DELETE",
    },
    onUnauthorized,
  });
}
export async function getSecurityAlerts(_token, onUnauthorized) {
  return apiRequest("/admin/security-alerts", { onUnauthorized });
}
