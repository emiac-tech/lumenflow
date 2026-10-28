import { appPath, withBase } from "./basePath";
export const getAuthToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token");
  }
  return null;
};

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const newInit: RequestInit = {
    ...init,
    headers,
  };

  const response = await fetch(typeof input === "string" ? withBase(input) : input, newInit);

  // Auto-logout if token is expired/invalid and it's an API route (not auth/login)
  if (response.status === 401 && typeof window !== "undefined" && !input.toString().includes("/api/auth/")) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = appPath("/login");
  }

  return response;
};
