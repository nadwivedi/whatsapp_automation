export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");

export async function apiRequest(path, { options = {}, onUnauthorized } = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (options.body && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}
