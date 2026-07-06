import type { AuthTokens } from "@note-taking-app/shared";
import { useAuthStore } from "@/store/authStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

let inFlightRefresh: Promise<AuthTokens> | null = null;

async function requestRefresh(refreshToken: string): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw new ApiError(res.status, "REFRESH_FAILED", "Failed to refresh session");
  }

  return (await res.json()) as AuthTokens;
}

function refreshOnce(refreshToken: string): Promise<AuthTokens> {
  if (!inFlightRefresh) {
    inFlightRefresh = requestRefresh(refreshToken).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string; fields?: { field: string; message: string }[] };
  };

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error?.code ?? "UNKNOWN_ERROR",
      body.error?.message ?? "Request failed",
      body.error?.fields,
    );
  }

  return body as T;
}

function doFetch(path: string, options: RequestInit, accessToken: string | undefined): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

export async function authenticatedFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = useAuthStore.getState().session;
  const res = await doFetch(path, options, session?.accessToken);

  if (res.status !== 401 || !session) {
    return parseJsonOrThrow<T>(res);
  }

  try {
    const tokens = await refreshOnce(session.refreshToken);
    useAuthStore.getState().login({ ...session, ...tokens });

    const retryRes = await doFetch(path, options, tokens.accessToken);
    if (retryRes.status === 401) {
      useAuthStore.getState().logout();
      throw new ApiError(401, "SESSION_EXPIRED", "Session expired");
    }

    return parseJsonOrThrow<T>(retryRes);
  } catch (err) {
    useAuthStore.getState().logout();
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(401, "SESSION_EXPIRED", "Session expired");
  }
}
