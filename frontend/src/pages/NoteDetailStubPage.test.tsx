import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AppRoutes } from "@/AppRoutes";
import { ApiError } from "@/lib/apiClient";
import * as notesApi from "@/lib/notesApi";
import { useAuthStore } from "@/store/authStore";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/notesApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notesApi")>();
  return {
    ...actual,
    listNotes: vi.fn(),
    getNote: vi.fn(),
  };
});

describe("NoteDetailStubPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();

    useAuthStore.setState({
      session: {
        user: { id: "1", email: "a@b.com", createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "tok",
        refreshToken: "rtok",
      },
    });
  });

  it("Visiting the stub detail page for a note the caller can't access shows not-found", async () => {
    vi.mocked(notesApi.getNote).mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Note not found"),
    );

    renderWithProviders(<AppRoutes />, ["/notes/some-id"]);

    expect(await screen.findByText("Note not found.")).toBeInTheDocument();
  });
});
