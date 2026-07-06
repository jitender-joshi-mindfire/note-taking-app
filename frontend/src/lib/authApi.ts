import type {
  AuthUser,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@note-taking-app/shared";
import { ApiError } from "./apiClient";

export { ApiError } from "./apiClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
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

  return body;
}

function postJson(path: string, body: unknown, accessToken?: string): Promise<unknown> {
  return fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  }).then(parseJsonOrThrow);
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  return (await postJson("/auth/register", input)) as AuthResponse;
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  return (await postJson("/auth/login", input)) as AuthResponse;
}

export async function logout(accessToken: string, refreshToken: string): Promise<void> {
  await postJson("/auth/logout", { refreshToken }, accessToken);
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  await postJson("/auth/forgot-password", input);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  await postJson("/auth/reset-password", input);
}
