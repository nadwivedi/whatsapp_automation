export const ROUTES = {
  dashboard: "/dashboard",
  sessions: "/sessions",
  templates: "/templates",
  campaigns: "/campaigns",
  messages: "/messages",
  settings: "/settings",
};

export const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "DS", path: ROUTES.dashboard },
  { key: "sessions", label: "Sessions", icon: "SE", path: ROUTES.sessions },
  { key: "templates", label: "Templates", icon: "TP", path: ROUTES.templates },
  { key: "campaigns", label: "Campaigns", icon: "CP", path: ROUTES.campaigns },
  { key: "messages", label: "Messages", icon: "MS", path: ROUTES.messages },
  { key: "settings", label: "Settings", icon: "ST", path: ROUTES.settings },
];

const ROUTE_KEYS = Object.fromEntries(NAV_ITEMS.map((item) => [item.path, item.key]));

export function getRouteKey(pathname) {
  return ROUTE_KEYS[pathname] || "dashboard";
}

export function ensureRoute(pathname) {
  return ROUTE_KEYS[pathname] ? pathname : ROUTES.dashboard;
}
