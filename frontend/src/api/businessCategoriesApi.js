import { apiRequest } from "./client";

export function listBusinessCategories(token, onUnauthorized) {
  return apiRequest("/business-categories", { token, onUnauthorized });
}

export function createBusinessCategory(token, payload) {
  return apiRequest("/business-categories", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function updateBusinessCategory(token, categoryId, payload) {
  return apiRequest(`/business-categories/${categoryId}`, {
    token,
    options: { method: "PATCH", body: JSON.stringify(payload) },
  });
}

export function deleteBusinessCategory(token, categoryId) {
  return apiRequest(`/business-categories/${categoryId}`, {
    token,
    options: { method: "DELETE" },
  });
}
