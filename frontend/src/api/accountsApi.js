import { apiRequest } from "./client";

export function listAccounts(token, onUnauthorized) {
  return apiRequest("/accounts", { token, onUnauthorized });
}

export function createAccount(token, payload) {
  return apiRequest("/accounts", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function startAccount(token, accountId) {
  return apiRequest(`/accounts/${accountId}/start`, { token, options: { method: "POST" } });
}

export function stopAccount(token, accountId) {
  return apiRequest(`/accounts/${accountId}/stop`, { token, options: { method: "POST" } });
}

export function updateAccountDailyLimit(token, accountId, dailyLimit) {
  return apiRequest(`/accounts/${accountId}/daily-limit`, {
    token,
    options: { method: "PATCH", body: JSON.stringify({ dailyLimit }) },
  });
}

export function getAccountQr(token, accountId) {
  return apiRequest(`/accounts/${accountId}/qr`, { token });
}

export function deleteAccount(token, accountId) {
  return apiRequest(`/accounts/${accountId}`, { token, options: { method: "DELETE" } });
}
