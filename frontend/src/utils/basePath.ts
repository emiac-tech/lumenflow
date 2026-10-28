// The app can be served from a sub-folder (e.g. https://os.risewithai.io/lighting).
// Next.js adds the folder to pages, <Link> and router.push automatically, but
// not to plain fetch() calls, <img src> or window.open(). Backend URLs stay
// "/api/..." and "/files/..." everywhere in the code and are prefixed here.
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

const PREFIXED = ["/api/", "/files/"];

export function withBase<T extends string | null | undefined>(url: T): T {
  if (!BASE_PATH || typeof url !== "string") return url;
  if (url.startsWith(BASE_PATH + "/")) return url;
  return (PREFIXED.some((prefix) => url.startsWith(prefix)) ? BASE_PATH + url : url) as T;
}

export function appPath(path: string): string {
  return BASE_PATH + path;
}

declare global {
  interface Window {
    __riseBaseFetch?: boolean;
  }
}

// Route every browser fetch("/api/...") / fetch("/files/...") through the folder.
export function installBasePathFetch() {
  if (!BASE_PATH || typeof window === "undefined" || window.__riseBaseFetch) return;
  window.__riseBaseFetch = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return originalFetch(withBase(input), init);
    }
    if (input instanceof URL && input.origin === window.location.origin) {
      const fixed = withBase(input.pathname);
      if (fixed !== input.pathname) {
        return originalFetch(new URL(fixed + input.search + input.hash, input.origin), init);
      }
    }
    return originalFetch(input, init);
  };
}

installBasePathFetch();
