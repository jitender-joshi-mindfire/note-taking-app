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

describe("NotesPlaceholderPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
  });

  it("Logging out clears the session and navigates to login", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.logout).mockResolvedValueOnce(undefined);

    useAuthStore.setState({
      session: {
        user: { id: "1", email: "a@b.com", createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "tok",
        refreshToken: "rtok",
      },
    });

    renderWithProviders(<AppRoutes />, ["/notes"]);

    expect(screen.getByText("Logged in as a@b.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(screen.getByText("Enter your email and password.")).toBeInTheDocument();
    });
    expect(useAuthStore.getState().session).toBeNull();
  });

  it("Clears the session and navigates to login even if the backend logout call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.logout).mockRejectedValueOnce(
      new authApi.ApiError(401, "UNAUTHENTICATED", "Missing or invalid access token"),
    );

    useAuthStore.setState({
      session: {
        user: { id: "1", email: "a@b.com", createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "tok",
        refreshToken: "rtok",
      },
    });

    renderWithProviders(<AppRoutes />, ["/notes"]);

    await user.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(screen.getByText("Enter your email and password.")).toBeInTheDocument();
    });
    expect(useAuthStore.getState().session).toBeNull();
  });
});
