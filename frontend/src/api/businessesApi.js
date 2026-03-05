import { apiRequest } from "./client";

export function listBusinesses(token, onUnauthorized) {
  return apiRequest("/businesses", { token, onUnauthorized });
}

export function createBusiness(token, payload) {
  return apiRequest("/businesses", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function bulkInsertBusinesses(token, payload) {
  return apiRequest("/businesses/bulk-json", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function deleteBusiness(token, businessId) {
  return apiRequest(`/businesses/${businessId}`, {
    token,
    options: { method: "DELETE" },
  });
}
