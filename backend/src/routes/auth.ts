import { type Router as RouterType, Router } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from "@note-taking-app/shared";
import {
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter,
  resetPasswordLimiter,
} from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  confirmPasswordReset,
  DuplicateEmailError,
  ExpiredOtpError,
  InvalidCredentialsError,
  InvalidOtpError,
  InvalidRefreshTokenError,
  login,
  logout,
  refresh,
  register,
  requestPasswordReset,
  WeakPasswordError,
} from "../services/AuthService.js";

export const authRouter: RouterType = Router();

function validationError(message: string, issues: { path: PropertyKey[]; message: string }[]) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message,
      fields: issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    },
  };
}

authRouter.post("/register", registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid registration data", parsed.error.issues));
    return;
  }

  try {
    const result = await register(parsed.data.email, parsed.data.password);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      res
        .status(422)
        .json({ error: { code: "DUPLICATE_EMAIL", message: "Email already registered" } });
      return;
    }
    throw err;
  }
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid login data", parsed.error.issues));
    return;
  }

  try {
    const result = await login(parsed.data.email, parsed.data.password);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res
        .status(401)
        .json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
      return;
    }
    throw err;
  }
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  const parsed = logoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid logout data", parsed.error.issues));
    return;
  }

  try {
    await logout(req.userId as string, parsed.data.refreshToken);
    res.status(204).send();
  } catch (err) {
    if (err instanceof InvalidRefreshTokenError) {
      res.status(401).json({
        error: { code: "INVALID_REFRESH_TOKEN", message: "Invalid or expired refresh token" },
      });
      return;
    }
    throw err;
  }
});

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid refresh data", parsed.error.issues));
    return;
  }

  try {
    const result = await refresh(parsed.data.refreshToken);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof InvalidRefreshTokenError) {
      res.status(401).json({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid, expired, or reused refresh token",
        },
      });
      return;
    }
    throw err;
  }
});

authRouter.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid email", parsed.error.issues));
    return;
  }

  await requestPasswordReset(parsed.data.email);
  res.status(200).json({});
});

authRouter.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid reset data", parsed.error.issues));
    return;
  }

  try {
    await confirmPasswordReset(parsed.data.email, parsed.data.otp, parsed.data.newPassword);
    res.status(200).json({});
  } catch (err) {
    if (err instanceof ExpiredOtpError) {
      res.status(410).json({ error: { code: "EXPIRED_OTP", message: "OTP has expired" } });
      return;
    }
    if (err instanceof InvalidOtpError) {
      res.status(401).json({ error: { code: "INVALID_OTP", message: "Invalid or used OTP" } });
      return;
    }
    if (err instanceof WeakPasswordError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid new password",
          fields: err.fields,
        },
      });
      return;
    }
    throw err;
  }
});
