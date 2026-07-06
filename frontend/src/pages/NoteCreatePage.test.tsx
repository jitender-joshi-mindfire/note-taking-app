import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteListResponse, NoteSummary } from "@note-taking-app/shared";
import { AppRoutes } from "@/AppRoutes";
import * as notesApi from "@/lib/notesApi";
import { emptyContentJson } from "@/lib/tiptapContent";
import { useAuthStore } from "@/store/authStore";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/notesApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notesApi")>();
  return {
    ...actual,
    listNotes: vi.fn(),
    getNote: vi.fn(),
    createNote: vi.fn(),
  };
});

function makeNote(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "new-id",
    title: "Untitled",
    content: emptyContentJson(),
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    tags: [],
    shareLink: null,
    ...overrides,
  };
}

function emptyNotesResponse(): NoteListResponse {
  return { items: [], total: 0, page: 1, pageSize: 20 };
}

function setSession() {
  useAuthStore.setState({
    session: {
      user: { id: "1", email: "a@b.com", createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "tok",
      refreshToken: "rtok",
    },
  });
}

describe("NoteCreatePage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
    vi.mocked(notesApi.listNotes).mockResolvedValue(emptyNotesResponse());
    setSession();
  });

  it("Visiting the new-note route creates a note and redirects to it", async () => {
    const note = makeNote();
    vi.mocked(notesApi.createNote).mockResolvedValue(note);
    vi.mocked(notesApi.getNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/new"]);

    expect(await screen.findByDisplayValue("Untitled")).toBeInTheDocument();

    expect(notesApi.createNote).toHaveBeenCalledWith({
      title: "Untitled",
      content: emptyContentJson(),
    });
    expect(notesApi.createNote).toHaveBeenCalledTimes(1);

    expect(notesApi.getNote).toHaveBeenCalledWith("new-id");
  });

  it("Shows an error state with a Try again control if auto-creation fails (beyond spec, error-branch coverage)", async () => {
    const user = userEvent.setup();
    const note = makeNote();
    vi.mocked(notesApi.createNote).mockRejectedValueOnce(new Error("network error"));
    vi.mocked(notesApi.getNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/new"]);

    expect(await screen.findByText("Something went wrong creating your note.")).toBeInTheDocument();

    vi.mocked(notesApi.createNote).mockResolvedValueOnce(note);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(notesApi.createNote).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByDisplayValue("Untitled")).toBeInTheDocument();
  });
});
