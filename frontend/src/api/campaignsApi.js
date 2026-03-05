import { apiRequest } from "./client";

export function listCampaigns(token, onUnauthorized) {
  return apiRequest("/campaigns", { token, onUnauthorized });
}

export function createCampaign(token, payload) {
  return apiRequest("/campaigns", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function updateCampaign(token, campaignId, payload) {
  return apiRequest(`/campaigns/${campaignId}`, {
    token,
    options: { method: "PATCH", body: JSON.stringify(payload) },
  });
}

export function deleteCampaign(token, campaignId) {
  return apiRequest(`/campaigns/${campaignId}`, {
    token,
    options: { method: "DELETE" },
  });
}

export function pauseCampaign(token, campaignId) {
  return apiRequest(`/campaigns/${campaignId}/pause`, { token, options: { method: "POST" } });
}

export function resumeCampaign(token, campaignId) {
  return apiRequest(`/campaigns/${campaignId}/resume`, { token, options: { method: "POST" } });
}

export function getCampaignMessages(token, campaignId) {
  return apiRequest(`/campaigns/${campaignId}/messages`, { token });
}
