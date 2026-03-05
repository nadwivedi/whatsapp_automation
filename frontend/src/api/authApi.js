import { apiRequest } from "./client";

export function login(credentials) {
  return apiRequest("/auth/login", {
    options: { method: "POST", body: JSON.stringify(credentials) },
  });
}

export function register(payload) {
  return apiRequest("/auth/register", {
    options: { method: "POST", body: JSON.stringify(payload) },
  });
}

export function logout() {
  return apiRequest("/auth/logout", {
    options: { method: "POST" },
  });
}

export function getMe(_token, onUnauthorized) {
  return apiRequest("/auth/me", { onUnauthorized });
}
