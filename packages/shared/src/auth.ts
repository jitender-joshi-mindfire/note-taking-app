import { z } from "zod";

export const passwordSchema = z.string().superRefine((password, ctx) => {
  if (password.length < 8) {
    ctx.addIssue({
      code: "custom",
      message: "Password must be at least 8 characters",
    });
  }
  if (!/[a-zA-Z]/.test(password)) {
    ctx.addIssue({
      code: "custom",
      message: "Password must contain at least one letter",
    });
  }
  if (!/[0-9]/.test(password)) {
    ctx.addIssue({
      code: "custom",
      message: "Password must contain at least one number",
    });
  }
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
