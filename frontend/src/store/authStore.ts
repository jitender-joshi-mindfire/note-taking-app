import { create } from "zustand";
import { clearSession, loadSession, saveSession, type StoredSession } from "@/lib/authStorage";

interface AuthState {
  session: StoredSession | null;
  login: (session: StoredSession) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: loadSession(),
  login: (session) => {
    saveSession(session);
    set({ session });
  },
  logout: () => {
    clearSession();
    set({ session: null });
  },
}));
