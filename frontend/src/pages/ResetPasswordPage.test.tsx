import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRoutes } from "@/AppRoutes";
import * as authApi from "@/lib/authApi";
import { useAuthStore } from "@/store/authStore";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authApi")>();
  return {
    ...actual,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  };
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "a@b.com");
  await user.type(screen.getByLabelText("Reset code"), "123456");
  await user.type(screen.getByLabelText("New password"), "Password1");
  await user.click(screen.getByRole("button", { name: "Reset password" }));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
  });

  it("Successful reset navigates to login, not notes", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.resetPassword).mockResolvedValueOnce(undefined);

    renderWithProviders(<AppRoutes />, ["/reset-password"]);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByText("Enter your email and password.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Logged in as a@b.com")).not.toBeInTheDocument();
    expect(useAuthStore.getState().session).toBeNull();
  });

  it("Expired OTP shows a distinct message", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.resetPassword).mockRejectedValueOnce(
      new authApi.ApiError(410, "EXPIRED_OTP", "OTP has expired"),
    );

    renderWithProviders(<AppRoutes />, ["/reset-password"]);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(
        screen.getByText("This code has expired. Please request a new one."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("That code is invalid or has already been used.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Password must be at least 8 characters/)).not.toBeInTheDocument();
  });

  it("Invalid or already-used OTP shows a distinct message", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.resetPassword).mockRejectedValueOnce(
      new authApi.ApiError(401, "INVALID_OTP", "Invalid or used OTP"),
    );

    renderWithProviders(<AppRoutes />, ["/reset-password"]);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(
        screen.getByText("That code is invalid or has already been used."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("This code has expired. Please request a new one.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Password must be at least 8 characters/)).not.toBeInTheDocument();
  });

  it("Weak new password shows field-level errors", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.resetPassword).mockRejectedValueOnce(
      new authApi.ApiError(400, "VALIDATION_ERROR", "Invalid new password", [
        { field: "newPassword", message: "Password must be at least 8 characters" },
      ]),
    );

    renderWithProviders(<AppRoutes />, ["/reset-password"]);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    });
    const newPasswordInput = screen.getByLabelText("New password");
    const fieldError = screen.getByText("Password must be at least 8 characters");
    expect(newPasswordInput.parentElement).toContainElement(fieldError);
  });
});
