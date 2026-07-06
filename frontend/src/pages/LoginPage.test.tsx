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

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
  });

  it("Successful login navigates to the notes page", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValueOnce({
      user: { id: "1", email: "a@b.com", createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "tok",
      refreshToken: "rtok",
    });

    renderWithProviders(<AppRoutes />, ["/login"]);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "Password1");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(screen.getByText("Logged in as a@b.com")).toBeInTheDocument();
    });
    expect(useAuthStore.getState().session?.accessToken).toBe("tok");
  });

  it("Invalid credentials show one generic error", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockRejectedValueOnce(
      new authApi.ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password"),
    );

    renderWithProviders(<AppRoutes />, ["/login"]);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
    });
    expect(screen.queryByText(/email is/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/password is/i)).not.toBeInTheDocument();
    expect(useAuthStore.getState().session).toBeNull();
  });
});
