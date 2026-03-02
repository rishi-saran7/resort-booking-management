/**
 * Lightweight API client.
 * All requests include the Bearer token from localStorage when available.
 * All responses are expected to follow: { success, data, error }
 *
 * NEXT_PUBLIC_API_URL must be set at build time.
 * For local dev: set it in frontend/.env.local
 * For Docker/EC2: pass it as a build arg in docker-compose.yml
 */

const BASE = process.env.NEXT_PUBLIC_API_URL;

if (!BASE) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set. " +
    "Add it to .env.local for development or pass it as a build arg in production."
  );
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("resort_token");
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error: string | null;
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data: ApiResponse<T> = await res.json();
  return data;
}

export const api = {
  get:    <T = unknown>(path: string) => request<T>(path, { method: "GET" }),
  post:   <T = unknown>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put:    <T = unknown>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch:  <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};
