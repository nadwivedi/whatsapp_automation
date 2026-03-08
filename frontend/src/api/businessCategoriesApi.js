import { apiRequest } from "./client";

export function listContactCategories(token, onUnauthorized) {
  return apiRequest("/contact-categories", { token, onUnauthorized });
}

export function createContactCategory(token, payload) {
  return apiRequest("/contact-categories", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function updateContactCategory(token, categoryId, payload) {
  return apiRequest(`/contact-categories/${categoryId}`, {
    token,
    options: { method: "PATCH", body: JSON.stringify(payload) },
  });
}

export function deleteContactCategory(token, categoryId) {
  return apiRequest(`/contact-categories/${categoryId}`, {
    token,
    options: { method: "DELETE" },
  });
}

export const listBusinessCategories = listContactCategories;
export const createBusinessCategory = createContactCategory;
export const updateBusinessCategory = updateContactCategory;
export const deleteBusinessCategory = deleteContactCategory;
