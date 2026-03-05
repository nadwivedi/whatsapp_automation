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
