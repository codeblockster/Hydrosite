import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

export class ApiClientError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const ACCESS_KEY = "hydrosite.access-token";
const REFRESH_KEY = "hydrosite.refresh-token";
type HydroRequestConfig = InternalAxiosRequestConfig & { _hydroRetried?: boolean };

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(ACCESS_KEY); } catch { return null; }
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(REFRESH_KEY); } catch { return null; }
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(ACCESS_KEY, token);
    else window.sessionStorage.removeItem(ACCESS_KEY);
  } catch {
    // Storage can be unavailable in private browsing; requests remain safely unauthenticated.
  }
}

export function setRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(REFRESH_KEY, token);
    else window.sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // Storage can be unavailable in private browsing; requests remain safely unauthenticated.
  }
}

export function clearAuthTokens(): void {
  setAccessToken(null);
  setRefreshToken(null);
}

export const apiClient = axios.create({
  baseURL: "/api/v2",
  timeout: 15000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

let refreshFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (!refreshFlight) {
    refreshFlight = axios.post<{ accessToken: string; refreshToken: string }>(
      "/api/v2/auth/refresh",
      { refreshToken },
      { timeout: 15000, headers: { Accept: "application/json", "Content-Type": "application/json" } },
    ).then(({ data }) => {
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      return data.accessToken;
    }).catch(() => {
      clearAuthTokens();
      return null;
    }).finally(() => {
      refreshFlight = null;
    });
  }
  return refreshFlight;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) config.headers.set("X-Request-Id", crypto.randomUUID());
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(new ApiClientError(0, "NETWORK_ERROR", "The request could not be completed."));
    const axiosError = error as AxiosError<{ error?: { status?: number; code?: string; message?: string; details?: unknown } }>;
    const config = axiosError.config as HydroRequestConfig | undefined;
    const isAuthEndpoint = Boolean(config?.url && /\/auth\/(login|refresh)$/.test(config.url));
    if (axiosError.response?.status === 401 && config && !config._hydroRetried && !isAuthEndpoint) {
      config._hydroRetried = true;
      const renewed = await refreshAccessToken();
      if (renewed) {
        config.headers.set("Authorization", `Bearer ${renewed}`);
        return apiClient(config);
      }
    }
    const envelope = axiosError.response?.data?.error;
    const status = envelope?.status ?? axiosError.response?.status ?? (axiosError.code === "ECONNABORTED" ? 408 : 0);
    const code = envelope?.code ?? (status === 0 ? "NETWORK_ERROR" : status === 408 ? "TIMEOUT" : `HTTP_${status}`);
    const message = envelope?.message ?? (status === 0
      ? "Unable to reach HydroSite. Check your connection and try again."
      : status === 408
        ? "The request took too long. Please try again."
        : axiosError.message || "The request could not be completed.");
    return Promise.reject(new ApiClientError(status, code, message, envelope?.details));
  },
);
