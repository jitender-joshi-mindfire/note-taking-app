import type { AuthUser } from "@note-taking-app/shared";

const STORAGE_KEY = "note-app-session";

export interface StoredSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
