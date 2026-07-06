import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "@/store/authStore";

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuthStore((state) => state.session);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
