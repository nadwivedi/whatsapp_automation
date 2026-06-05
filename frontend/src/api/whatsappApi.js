import { apiRequest } from "./client";

export function getWhatsAppStatus(token, onUnauthorized) {
  return apiRequest("/whatsapp/status", { token, onUnauthorized });
}

export function startWhatsAppSession(token, onUnauthorized) {
  return apiRequest("/whatsapp/start", { token, options: { method: "POST" }, onUnauthorized });
}

export function stopWhatsAppSession(token, onUnauthorized) {
  return apiRequest("/whatsapp/stop", { token, options: { method: "POST" }, onUnauthorized });
}

export function logoutWhatsAppSession(token, onUnauthorized) {
  return apiRequest("/whatsapp/logout", { token, options: { method: "POST" }, onUnauthorized });
}

export function renewWhatsAppQR(token, onUnauthorized) {
  return apiRequest("/whatsapp/renew-qr", { token, options: { method: "POST" }, onUnauthorized });
}

export function getWhatsAppLogs(token, page = 1, onUnauthorized) {
  return apiRequest(`/whatsapp/logs?page=${page}&limit=50`, { token, onUnauthorized });
}

export function deleteWhatsAppLog(token, logId, onUnauthorized) {
  return apiRequest(`/whatsapp/logs/${logId}`, { token, options: { method: "DELETE" }, onUnauthorized });
}
