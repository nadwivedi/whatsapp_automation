import { apiRequest } from "./client";

export function getSettings(token, onUnauthorized) {
  return apiRequest("/settings", { token, onUnauthorized });
}

export function updateSettings(token, payload) {
  return apiRequest("/settings", {
    token,
    options: { method: "PATCH", body: JSON.stringify(payload) },
  });
}

export function migrateNumbers(token) {
  return apiRequest("/settings/migrate", {
    token,
    options: { method: "POST" },
  });
}
