import { type FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { resetPasswordSchema } from "@note-taking-app/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, resetPassword } from "@/lib/authApi";
import { groupFieldErrors, zodIssuesToFieldErrors } from "@/lib/formErrors";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [otpError, setOtpError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      navigate("/login", { state: { resetSuccess: true } });
    },
    onError: (error) => {
      setOtpError(null);
      setFieldErrors({});
      if (error instanceof ApiError) {
        if (error.code === "EXPIRED_OTP") {
          setOtpError("This code has expired. Please request a new one.");
          return;
        }
        if (error.code === "INVALID_OTP") {
          setOtpError("That code is invalid or has already been used.");
          return;
        }
        if (error.fields) {
          setFieldErrors(groupFieldErrors(error.fields));
          return;
        }
        setOtpError(error.message);
        return;
      }
      setOtpError("Something went wrong. Please try again.");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setOtpError(null);
    const parsed = resetPasswordSchema.safeParse({ email, otp, newPassword });
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
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter the code you received and a new password.</CardDescription>
        </CardHeader>
        <CardContent>
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
              <Label htmlFor="otp">Reset code</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                required
              />
              {fieldErrors.otp?.map((message) => (
                <p key={message} className="text-destructive text-sm">
                  {message}
                </p>
              ))}
              {otpError && <p className="text-destructive text-sm">{otpError}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              {fieldErrors.newPassword?.map((message) => (
                <p key={message} className="text-destructive text-sm">
                  {message}
                </p>
              ))}
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Resetting..." : "Reset password"}
            </Button>
          </form>
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
