import { apiRequest } from "./client";

export function listContacts(token, onUnauthorized) {
  return apiRequest("/contacts", { token, onUnauthorized });
}

export function createContact(token, payload) {
  return apiRequest("/contacts", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function bulkInsertContacts(token, payload) {
  return apiRequest("/contacts/bulk-json", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function deleteContact(token, contactId) {
  return apiRequest(`/contacts/${contactId}`, {
    token,
    options: { method: "DELETE" },
  });
}

export const listBusinesses = listContacts;
export const createBusiness = createContact;
export const bulkInsertBusinesses = bulkInsertContacts;
export const deleteBusiness = deleteContact;
