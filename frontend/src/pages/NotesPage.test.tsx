import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteListResponse, NoteSummary, TagListResponse } from "@note-taking-app/shared";
import { AppRoutes } from "@/AppRoutes";
import * as authApi from "@/lib/authApi";
import * as notesApi from "@/lib/notesApi";
import * as tagsApi from "@/lib/tagsApi";
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
    listNotes: vi.fn(),
    getNote: vi.fn(),
  };
});

vi.mock("@/lib/tagsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tagsApi")>();
  return {
    ...actual,
    listTags: vi.fn(),
  };
});

function makeNote(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "note-1",
    title: "First note",
    content: "Some note content",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    tags: [],
    shareLink: null,
    ...overrides,
  };
}

function notesResponse(overrides: Partial<NoteListResponse> = {}): NoteListResponse {
  return {
    items: [makeNote()],
    total: 1,
    page: 1,
    pageSize: 20,
    ...overrides,
  };
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

describe("NotesPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
    vi.mocked(tagsApi.listTags).mockResolvedValue(emptyTags());
    vi.mocked(notesApi.listNotes).mockResolvedValue(notesResponse());
    setSession();
  });

  it("Notes list renders the caller's notes", async () => {
    const notes = [
      makeNote({
        id: "note-1",
        title: "First note",
        content: "Content of first note",
        tags: [{ id: "tag-1", name: "Work", color: "#ff0000" }],
        updatedAt: "2024-01-02T00:00:00Z",
      }),
      makeNote({
        id: "note-2",
        title: "Second note",
        content: "Content of second note",
        tags: [],
        updatedAt: "2024-01-03T00:00:00Z",
      }),
    ];
    vi.mocked(notesApi.listNotes).mockResolvedValue(
      notesResponse({ items: notes, total: 2 }),
    );

    renderWithProviders(<AppRoutes />, ["/notes"]);

    expect(await screen.findByText("First note")).toBeInTheDocument();
    expect(screen.getByText("Content of first note")).toBeInTheDocument();
    expect(screen.getByText("#Work")).toBeInTheDocument();
    expect(
      screen.getByText(`Updated ${new Date("2024-01-02T00:00:00Z").toLocaleString()}`),
    ).toBeInTheDocument();

    expect(screen.getByText("Second note")).toBeInTheDocument();
    expect(screen.getByText("Content of second note")).toBeInTheDocument();
  });

  it("Empty notes list shows an explicit empty state", async () => {
    vi.mocked(notesApi.listNotes).mockResolvedValue(
      notesResponse({ items: [], total: 0 }),
    );

    renderWithProviders(<AppRoutes />, ["/notes"]);

    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
  });

  it("Navigating to the next page requests the next page from the backend", async () => {
    const user = userEvent.setup();
    vi.mocked(notesApi.listNotes).mockResolvedValue(
      notesResponse({ items: [makeNote()], total: 45 }),
    );

    renderWithProviders(<AppRoutes />, ["/notes"]);

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(vi.mocked(notesApi.listNotes)).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });
  });

  it("Previous is disabled on the first page", async () => {
    renderWithProviders(<AppRoutes />, ["/notes"]);

    const previousButton = await screen.findByRole("button", { name: "Previous" });
    expect(previousButton).toBeDisabled();
  });

  it("Next is disabled on the last page", async () => {
    vi.mocked(notesApi.listNotes).mockResolvedValue(
      notesResponse({ items: [makeNote()], total: 1 }),
    );

    renderWithProviders(<AppRoutes />, ["/notes"]);

    const nextButton = await screen.findByRole("button", { name: "Next" });
    expect(nextButton).toBeDisabled();
  });

  it("Changing sort re-fetches and resets to page 1", async () => {
    const user = userEvent.setup();
    vi.mocked(notesApi.listNotes).mockResolvedValue(
      notesResponse({ items: [makeNote()], total: 45 }),
    );

    renderWithProviders(<AppRoutes />, ["/notes"]);

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("Sort by"), "Title A–Z");

    await waitFor(() => {
      expect(vi.mocked(notesApi.listNotes)).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, sortBy: "title", sortDir: "asc" }),
      );
    });
  });

  it("Default sort matches the backend's default", async () => {
    renderWithProviders(<AppRoutes />, ["/notes"]);

    await waitFor(() => {
      expect(vi.mocked(notesApi.listNotes)).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: "updatedAt", sortDir: "desc" }),
      );
    });

    const select = (await screen.findByLabelText("Sort by")) as HTMLSelectElement;
    expect(
      within(select).getByRole("option", { name: "Recently updated", selected: true }),
    ).toBeInTheDocument();
  });

  it("Toggling a tag chip on filters the list", async () => {
    const user = userEvent.setup();
    vi.mocked(tagsApi.listTags).mockResolvedValue({
      items: [{ id: "tag-1", name: "Work", color: "#ff0000", createdAt: "2024-01-01T00:00:00Z", noteCount: 1 }],
    });

    renderWithProviders(<AppRoutes />, ["/notes"]);

    const workChip = await screen.findByRole("button", { name: "Work" });
    await user.click(workChip);

    await waitFor(() => {
      expect(vi.mocked(notesApi.listNotes)).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, tagIds: ["tag-1"] }),
      );
    });
  });

  it("Toggling multiple tags requires all of them (AND semantics)", async () => {
    const user = userEvent.setup();
    vi.mocked(tagsApi.listTags).mockResolvedValue({
      items: [
        { id: "tag-1", name: "Work", color: "#ff0000", createdAt: "2024-01-01T00:00:00Z", noteCount: 1 },
        { id: "tag-2", name: "Personal", color: "#00ff00", createdAt: "2024-01-01T00:00:00Z", noteCount: 1 },
      ],
    });

    renderWithProviders(<AppRoutes />, ["/notes"]);

    await user.click(await screen.findByRole("button", { name: "Work" }));
    await user.click(await screen.findByRole("button", { name: "Personal" }));

    await waitFor(() => {
      const lastCall = vi.mocked(notesApi.listNotes).mock.calls.at(-1)?.[0];
      expect(lastCall?.tagIds).toEqual(expect.arrayContaining(["tag-1", "tag-2"]));
      expect(lastCall?.tagIds).toHaveLength(2);
    });
  });

  it("Toggling a chip off removes it from the filter", async () => {
    const user = userEvent.setup();
    vi.mocked(tagsApi.listTags).mockResolvedValue({
      items: [{ id: "tag-1", name: "Work", color: "#ff0000", createdAt: "2024-01-01T00:00:00Z", noteCount: 1 }],
    });

    renderWithProviders(<AppRoutes />, ["/notes"]);

    const workChip = await screen.findByRole("button", { name: "Work" });
    await user.click(workChip);

    await waitFor(() => {
      expect(vi.mocked(notesApi.listNotes)).toHaveBeenLastCalledWith(
        expect.objectContaining({ tagIds: ["tag-1"] }),
      );
    });

    await user.click(workChip);

    await waitFor(() => {
      expect(vi.mocked(notesApi.listNotes)).toHaveBeenLastCalledWith(
        expect.objectContaining({ tagIds: [] }),
      );
    });
  });

  it("Logging out clears the session and navigates to login", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.logout).mockResolvedValueOnce(undefined);

    renderWithProviders(<AppRoutes />, ["/notes"]);

    expect(await screen.findByText("Logged in as a@b.com")).toBeInTheDocument();

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

    renderWithProviders(<AppRoutes />, ["/notes"]);

    expect(await screen.findByText("Logged in as a@b.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(screen.getByText("Enter your email and password.")).toBeInTheDocument();
    });
    expect(useAuthStore.getState().session).toBeNull();
  });
});
