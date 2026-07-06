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

describe("RegisterPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
  });

  it("Successful registration navigates to the notes page", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockResolvedValueOnce({
      user: { id: "1", email: "a@b.com", createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "tok",
      refreshToken: "rtok",
    });

    renderWithProviders(<AppRoutes />, ["/register"]);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "Password1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getByText("Logged in as a@b.com")).toBeInTheDocument();
    });
    expect(useAuthStore.getState().session?.accessToken).toBe("tok");
  });

  it("Duplicate email shows the generic backend error", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockRejectedValueOnce(
      new authApi.ApiError(422, "DUPLICATE_EMAIL", "Email already registered"),
    );

    renderWithProviders(<AppRoutes />, ["/register"]);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "Password1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getByText("Email already registered")).toBeInTheDocument();
    });
    expect(screen.getByText("Register with your email and a password.")).toBeInTheDocument();
    expect(useAuthStore.getState().session).toBeNull();
  });

  it("Weak password shows field-level errors", async () => {
    const user = userEvent.setup();

    renderWithProviders(<AppRoutes />, ["/register"]);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    });
    expect(screen.getByText("Password must contain at least one number")).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });
});
