import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
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

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
  });

  it("Submitting any email shows the same generic confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.forgotPassword).mockResolvedValueOnce(undefined);

    renderWithProviders(<ForgotPasswordPage />, ["/forgot-password"]);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Send reset code" }));

    await waitFor(() => {
      expect(
        screen.getByText(/If that email is registered, a reset code has been sent/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/check the backend server console for the code/i)).toBeInTheDocument();
  });
});
