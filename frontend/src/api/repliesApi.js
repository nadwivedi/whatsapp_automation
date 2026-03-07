import { apiRequest } from "./client";

export function listConversations(token, onUnauthorized) {
  return apiRequest("/replies/conversations", { token, onUnauthorized });
}

export function getConversationMessages(token, contactNumber, onUnauthorized) {
  return apiRequest(`/replies/conversations/${contactNumber}/messages`, {
    token,
    onUnauthorized,
  });
}

export function markConversationRead(token, contactNumber, onUnauthorized) {
  return apiRequest(`/replies/conversations/${contactNumber}/read`, {
    token,
    onUnauthorized,
    options: { method: "PATCH" },
  });
}

export function sendConversationReply(token, contactNumber, payload) {
  return apiRequest(`/replies/conversations/${contactNumber}/reply`, {
    token,
    options: {
      method: "POST",
      body: JSON.stringify(payload),
    },
  });
}
