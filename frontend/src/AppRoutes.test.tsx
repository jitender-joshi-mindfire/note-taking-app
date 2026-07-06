import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AppRoutes } from "@/AppRoutes";
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

vi.mock("@/lib/notesApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notesApi")>();
  return {
    ...actual,
    listNotes: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    getNote: vi.fn(),
  };
});

vi.mock("@/lib/tagsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tagsApi")>();
  return {
    ...actual,
    listTags: vi.fn().mockResolvedValue({ items: [] }),
  };
});

describe("AppRoutes route protection", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
  });

  it("Unauthenticated visit to the notes page redirects to login", () => {
    useAuthStore.setState({ session: null });

    renderWithProviders(<AppRoutes />, ["/notes"]);

    expect(screen.getByText("Enter your email and password.")).toBeInTheDocument();
    expect(screen.queryByText(/Logged in as/)).not.toBeInTheDocument();
  });

  it("Authenticated visit to an auth page redirects to notes", () => {
    useAuthStore.setState({
      session: {
        user: { id: "1", email: "a@b.com", createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "tok",
        refreshToken: "rtok",
      },
    });

    renderWithProviders(<AppRoutes />, ["/login"]);

    expect(screen.getByText("Logged in as a@b.com")).toBeInTheDocument();
    expect(screen.queryByText("Enter your email and password.")).not.toBeInTheDocument();
  });
});
