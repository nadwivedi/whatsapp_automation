import { apiRequest } from "./client";

export function listTemplates(token, onUnauthorized) {
  return apiRequest("/templates", { token, onUnauthorized });
}

export function createTemplate(token, payload) {
  return apiRequest("/templates", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}
