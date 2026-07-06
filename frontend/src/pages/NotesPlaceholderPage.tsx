import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { logout as logoutRequest } from "@/lib/authApi";
import { useAuthStore } from "@/store/authStore";

export function NotesPlaceholderPage() {
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const logout = useAuthStore((state) => state.logout);

  const mutation = useMutation({
    mutationFn: () => {
      if (!session) {
        return Promise.resolve();
      }
      return logoutRequest(session.accessToken, session.refreshToken);
    },
    onSettled: () => {
      logout();
      navigate("/login");
    },
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <p>Logged in as {session?.user.email}</p>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? "Logging out..." : "Log out"}
      </Button>
    </div>
  );
}
