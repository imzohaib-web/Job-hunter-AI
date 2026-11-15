import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

// In-memory access token storage
let inMemoryAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach in-memory access token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Concurrency lock and queue for single in-flight refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

// Callback hook to notify auth store of state changes on token refresh/expiry
type AuthStateSync = {
  onRefreshed?: (token: string, user: unknown) => void;
  onSessionExpired?: () => void;
};

let authStateSync: AuthStateSync = {};

export function registerAuthStateSync(sync: AuthStateSync): void {
  authStateSync = sync;
}

/**
 * Direct call to refresh endpoint using clean axios instance (no 401 loop).
 */
export async function refreshAuthSession(): Promise<{ accessToken: string; user: unknown }> {
  const response = await axios.post<{ accessToken: string; user: unknown }>(
    "/api/auth/refresh",
    {},
    { withCredentials: true },
  );
  const { accessToken, user } = response.data;
  setAccessToken(accessToken);
  if (authStateSync.onRefreshed) {
    authStateSync.onRefreshed(accessToken, user);
  }
  return { accessToken, user };
}

// Response interceptor: handle 401 with automatic refresh token rotation
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as CustomAxiosRequestConfig | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const is401 = error.response?.status === 401;
    const isAuthEndpoint =
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/register") ||
      originalRequest.url?.includes("/auth/refresh") ||
      originalRequest.url?.includes("/auth/logout");

    // Do not attempt refresh on auth endpoints or if already retried
    if (!is401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        })
        .catch((queueErr) => Promise.reject(queueErr));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { accessToken } = await refreshAuthSession();
      processQueue(null, accessToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      }
      return apiClient(originalRequest);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      setAccessToken(null);
      if (authStateSync.onSessionExpired) {
        authStateSync.onSessionExpired();
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
