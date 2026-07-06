import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "@/store/authStore";

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const session = useAuthStore((state) => state.session);

  if (session) {
    return <Navigate to="/notes" replace />;
  }

  return children;
}
