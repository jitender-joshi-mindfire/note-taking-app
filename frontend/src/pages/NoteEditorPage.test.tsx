import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteListResponse, NoteSummary, TagListResponse } from "@note-taking-app/shared";
import { AppRoutes } from "@/AppRoutes";
import { ApiError } from "@/lib/apiClient";
import * as notesApi from "@/lib/notesApi";
import * as tagsApi from "@/lib/tagsApi";
import { useAuthStore } from "@/store/authStore";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/notesApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notesApi")>();
  return {
    ...actual,
    listNotes: vi.fn(),
    getNote: vi.fn(),
    updateNote: vi.fn(),
  };
});

vi.mock("@/lib/tagsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tagsApi")>();
  return {
    ...actual,
    listTags: vi.fn(),
  };
});

const AUTOSAVE_DELAY_MS = 2500;

function makeNote(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "note-1",
    title: "First note",
    content: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    }),
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    tags: [],
    shareLink: null,
    ...overrides,
  };
}

function emptyNotesResponse(): NoteListResponse {
  return { items: [], total: 0, page: 1, pageSize: 20 };
}

function emptyTags(): TagListResponse {
  return { items: [] };
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

describe("NoteEditorPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
    vi.mocked(notesApi.listNotes).mockResolvedValue(emptyNotesResponse());
    vi.mocked(tagsApi.listTags).mockResolvedValue(emptyTags());
    setSession();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Opening an existing note loads its content into the editor", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    expect(await screen.findByDisplayValue("First note")).toBeInTheDocument();
    expect(await screen.findByText("Hello world")).toBeInTheDocument();

    // Advance well past the debounce window — merely loading the note must not autosave.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 1000);
    });

    expect(notesApi.updateNote).not.toHaveBeenCalled();
  });

  it("Applying formatting updates the editor content", async () => {
    // TipTap's EditorContent renders a real ProseMirror contenteditable div. jsdom's selection
    // model is limited, but clicking a toolbar button while the editor holds a collapsed
    // selection inside the existing text still runs editor.chain().focus().toggleBold().run(),
    // which TipTap applies as a stored mark to subsequently-typed/enclosing text — this is
    // reliably observable in jsdom via the resulting <strong> markup, so we assert on that
    // directly rather than needing a real text-selection gesture.
    const user = userEvent.setup();
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    expect(await screen.findByText("Hello world")).toBeInTheDocument();
    const boldButton = screen.getByRole("button", { name: "Bold" });

    await user.click(boldButton);

    await waitFor(() => {
      const strong = document.querySelector("strong");
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe("Hello world");
    });
  });

  it("A pause in typing triggers a save", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);
    vi.mocked(notesApi.updateNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    const titleInput = await screen.findByDisplayValue("First note");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed note");

    expect(notesApi.updateNote).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });

    expect(notesApi.updateNote).toHaveBeenCalledTimes(1);
    expect(notesApi.updateNote).toHaveBeenCalledWith(
      "note-1",
      expect.objectContaining({ title: "Renamed note" }),
    );
  });

  it("Rapid successive edits produce only one save request", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);
    vi.mocked(notesApi.updateNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    const titleInput = await screen.findByDisplayValue("First note");
    await user.clear(titleInput);

    await user.type(titleInput, "A");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await user.type(titleInput, "B");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await user.type(titleInput, "C");

    expect(notesApi.updateNote).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });

    expect(notesApi.updateNote).toHaveBeenCalledTimes(1);
    expect(notesApi.updateNote).toHaveBeenCalledWith(
      "note-1",
      expect.objectContaining({ title: "ABC" }),
    );
  });

  it("An edit made while a save is still in flight queues a retry instead of overlapping it (beyond spec)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);
    let resolveFirstSave: (value: NoteSummary) => void = () => {};
    vi.mocked(notesApi.updateNote).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstSave = resolve;
      }),
    );

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    const titleInput = await screen.findByDisplayValue("First note");
    await user.clear(titleInput);
    await user.type(titleInput, "First edit");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });

    // First save is now in flight (unresolved). Make another edit and let its
    // debounce cycle elapse too, while the first request is still pending.
    expect(notesApi.updateNote).toHaveBeenCalledTimes(1);

    await user.type(titleInput, " plus more");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });

    // The second debounce cycle must NOT fire a second, overlapping request —
    // it should be queued until the first one settles.
    expect(notesApi.updateNote).toHaveBeenCalledTimes(1);

    vi.mocked(notesApi.updateNote).mockResolvedValueOnce(note);
    await act(async () => {
      resolveFirstSave(note);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(notesApi.updateNote).toHaveBeenCalledTimes(2);
    });
    expect(notesApi.updateNote).toHaveBeenNthCalledWith(
      2,
      "note-1",
      expect.objectContaining({ title: "First edit plus more" }),
    );
  });

  it('Status shows "Saving..." while a save is in flight', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);
    let resolveUpdate: (value: NoteSummary) => void = () => {};
    vi.mocked(notesApi.updateNote).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    const titleInput = await screen.findByDisplayValue("First note");
    await user.type(titleInput, "!");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });

    expect(await screen.findByText("Saving...")).toBeInTheDocument();

    resolveUpdate(note);
  });

  it('Status shows "Saved" after a successful save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);
    vi.mocked(notesApi.updateNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    const titleInput = await screen.findByDisplayValue("First note");
    await user.type(titleInput, "!");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });

    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("Status shows an error state if a save fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);
    vi.mocked(notesApi.updateNote).mockRejectedValue(new Error("network error"));

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    const titleInput = await screen.findByDisplayValue("First note");
    await user.type(titleInput, "!");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });

    expect(await screen.findByText("Save failed")).toBeInTheDocument();
  });

  it("Navigating back to the notes list flushes a pending save first", async () => {
    const user = userEvent.setup();
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);
    vi.mocked(notesApi.updateNote).mockResolvedValue({ ...note, title: "Renamed note" });
    vi.mocked(notesApi.listNotes).mockResolvedValue(emptyNotesResponse());

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    const titleInput = await screen.findByDisplayValue("First note");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed note");

    // Still within the debounce window — no save sent yet.
    expect(notesApi.updateNote).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Back to notes" }));

    await waitFor(() => {
      expect(notesApi.updateNote).toHaveBeenCalledTimes(1);
    });
    expect(notesApi.updateNote).toHaveBeenCalledWith(
      "note-1",
      expect.objectContaining({ title: "Renamed note" }),
    );

    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
  });

  it("Clearing the title blocks autosave", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    const titleInput = await screen.findByDisplayValue("First note");
    await user.click(titleInput);
    await user.clear(titleInput);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(notesApi.updateNote).not.toHaveBeenCalled();
  });

  it("Visiting the editor for an inaccessible note shows not-found", async () => {
    vi.mocked(notesApi.getNote).mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Note not found"),
    );

    renderWithProviders(<AppRoutes />, ["/notes/some-id"]);

    expect(await screen.findByText("Note not found.")).toBeInTheDocument();
  });

  it("Clicking Share opens the modal for the current note", async () => {
    const user = userEvent.setup();
    const note = makeNote();
    vi.mocked(notesApi.getNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/notes/note-1"]);

    expect(await screen.findByDisplayValue("First note")).toBeInTheDocument();
    expect(screen.queryByText("This note has no active share link.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByText("This note has no active share link.")).toBeInTheDocument();
  });
});
