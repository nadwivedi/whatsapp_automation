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

export function listAccountGroups(token, accountId) {
  return apiRequest(`/accounts/${accountId}/groups`, { token });
}

export function findAccountGroupsByNumber(token, accountId, mobileNumber) {
  const query = new URLSearchParams({ mobileNumber }).toString();
  return apiRequest(`/accounts/${accountId}/groups/search-by-number?${query}`, { token });
}

export function getAccountGroupParticipants(token, accountId, groupId) {
  return apiRequest(`/accounts/${accountId}/groups/${encodeURIComponent(groupId)}/participants`, {
    token,
  });
}

export function deleteAccount(token, accountId) {
  return apiRequest(`/accounts/${accountId}`, { token, options: { method: "DELETE" } });
}
