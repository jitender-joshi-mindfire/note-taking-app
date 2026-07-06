import { type FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import { loginSchema } from "@note-taking-app/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, login as loginRequest } from "@/lib/authApi";
import { zodIssuesToFieldErrors } from "@/lib/formErrors";
import { useAuthStore } from "@/store/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const resetSuccess = Boolean((location.state as { resetSuccess?: boolean } | null)?.resetSuccess);

  const mutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (result) => {
      login(result);
      navigate("/notes");
    },
    onError: (error) => {
      setGeneralError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setGeneralError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Enter your email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          {resetSuccess && (
            <p className="mb-4 text-sm text-green-700">
              Your password was reset. Please log in with your new password.
            </p>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              {fieldErrors.email?.map((message) => (
                <p key={message} className="text-destructive text-sm">
                  {message}
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {generalError && <p className="text-destructive text-sm">{generalError}</p>}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Logging in..." : "Log in"}
            </Button>
          </form>
          <div className="text-muted-foreground mt-4 flex flex-col items-center gap-1 text-center text-sm">
            <Link to="/forgot-password" className="underline">
              Forgot your password?
            </Link>
            <span>
              Need an account?{" "}
              <Link to="/register" className="underline">
                Register
              </Link>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
