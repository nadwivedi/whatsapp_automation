export const API_BASE = (
  import.meta.env.API_BASE_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api"
).replace(/\/$/, "");

function deriveWebSocketBaseUrl(apiBase) {
  const withoutApiSuffix = apiBase.replace(/\/api$/i, "");

  try {
    const parsed = new URL(withoutApiSuffix);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}`;
  } catch (_error) {
    return "ws://localhost:5000";
  }
}

const configuredWsBase =
  import.meta.env.WS_BASE_URL || import.meta.env.VITE_WS_BASE_URL || "";

export const REPLIES_WS_URL = `${(configuredWsBase || deriveWebSocketBaseUrl(API_BASE)).replace(/\/$/, "")}/ws/replies`;

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
    const error = new Error(data.message || `Request failed (${res.status})`);
    if (data && typeof data === "object") {
      error.details = data;
    }
    throw error;
  }
  return data;
}
