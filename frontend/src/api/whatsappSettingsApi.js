import { apiRequest } from "./client";

export function getWhatsAppSettings(token, onUnauthorized) {
  return apiRequest("/whatsapp-settings", { token, onUnauthorized });
}

export function updateWhatsAppSettings(token, payload, onUnauthorized) {
  return apiRequest("/whatsapp-settings", {
    token,
    options: { method: "PUT", body: JSON.stringify(payload) },
    onUnauthorized,
  });
}
