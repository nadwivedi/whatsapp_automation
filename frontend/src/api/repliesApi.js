import { apiRequest } from "./client";

export function listConversations(token, options = {}) {
  const { filter = "replied", onlyDatabaseContacts = false, limit = 200 } = options;
  const query = `?filter=${filter}&onlyDatabaseContacts=${onlyDatabaseContacts}&limit=${limit}`;
  return apiRequest(`/replies/conversations${query}`, { token });
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

export function deleteConversation(token, contactNumber, onUnauthorized) {
  return apiRequest(`/replies/conversations/${contactNumber}`, {
    token,
    onUnauthorized,
    options: { method: "DELETE" },
  });
}

export function clearAllChats(token) {
  return apiRequest("/replies/conversations/clear/all", {
    token,
    options: { method: "DELETE" },
  });
}

export function clearUnrepliedChats(token) {
  return apiRequest("/replies/conversations/clear/unreplied", {
    token,
    options: { method: "DELETE" },
  });
}
