import { useEffect, useState } from "react";
import { ensureRoute } from "../router/routes";

export function usePathRoute() {
  const [pathname, setPathname] = useState(() => ensureRoute(window.location.pathname));

  useEffect(() => {
    const normalized = ensureRoute(window.location.pathname);
    if (normalized !== window.location.pathname) {
      window.history.replaceState({}, "", normalized);
    }

    const onPopState = () => setPathname(ensureRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(nextPath) {
    const normalized = ensureRoute(nextPath);
    if (normalized === pathname) return;
    window.history.pushState({}, "", normalized);
    setPathname(normalized);
  }

  return { pathname, navigate };
}
