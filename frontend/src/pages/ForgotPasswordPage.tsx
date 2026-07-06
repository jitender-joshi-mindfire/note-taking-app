import { type FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { forgotPasswordSchema } from "@note-taking-app/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPassword } from "@/lib/authApi";
import { zodIssuesToFieldErrors } from "@/lib/formErrors";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: forgotPassword,
    onSuccess: () => setSubmitted(true),
    onError: () => setGeneralError("Something went wrong. Please try again."),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setGeneralError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
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
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>Enter your email and we'll send you a reset code.</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                If that email is registered, a reset code has been sent. (Development mode: this
                app doesn't send real email — check the backend server console for the code.)
              </p>
              <Link to="/reset-password" className="text-sm underline">
                I have a code
              </Link>
            </div>
          ) : (
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
              {generalError && <p className="text-destructive text-sm">{generalError}</p>}
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Sending..." : "Send reset code"}
              </Button>
            </form>
          )}
          <p className="text-muted-foreground mt-4 text-center text-sm">
            <Link to="/login" className="underline">
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
