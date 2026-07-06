import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteSummary, SearchResponse, TagListResponse } from "@note-taking-app/shared";
import { AppRoutes } from "@/AppRoutes";
import * as notesApi from "@/lib/notesApi";
import * as searchApi from "@/lib/searchApi";
import * as tagsApi from "@/lib/tagsApi";
import { useAuthStore } from "@/store/authStore";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/searchApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/searchApi")>();
  return {
    ...actual,
    search: vi.fn(),
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

const DEBOUNCE_MS = 400;

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

function makeSearchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    items: [{ note: makeNote(), snippet: "a matching snippet" }],
    total: 1,
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

function emptyNotesResponse() {
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

describe("SearchPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
    vi.mocked(notesApi.listNotes).mockResolvedValue(emptyNotesResponse());
    vi.mocked(tagsApi.listTags).mockResolvedValue(emptyTags());
    vi.mocked(searchApi.search).mockResolvedValue(makeSearchResponse());
    setSession();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Clicking Search from the notes list navigates to the search page", async () => {
    const user = userEvent.setup();

    renderWithProviders(<AppRoutes />, ["/notes"]);

    await user.click(await screen.findByRole("link", { name: "Search" }));

    expect(
      await screen.findByText("Search for something to find your notes."),
    ).toBeInTheDocument();
  });

  it("Typing a query triggers a search after the debounce interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");
    await user.type(input, "hello");

    expect(searchApi.search).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    expect(searchApi.search).toHaveBeenCalledTimes(1);
    expect(searchApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ q: "hello", page: 1 }),
    );
  });

  it("An empty query does not trigger a search", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderWithProviders(<AppRoutes />, ["/search"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    expect(searchApi.search).not.toHaveBeenCalled();
    expect(
      screen.getByText("Search for something to find your notes."),
    ).toBeInTheDocument();
  });

  it("Rapid typing produces only one search request", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");

    await user.type(input, "a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await user.type(input, "b");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await user.type(input, "c");

    expect(searchApi.search).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    expect(searchApi.search).toHaveBeenCalledTimes(1);
    expect(searchApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ q: "abc", page: 1 }),
    );
  });

  it("Search results show matching notes with their tags and updated time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(searchApi.search).mockResolvedValue(
      makeSearchResponse({
        items: [
          {
            note: makeNote({
              title: "Tagged note",
              tags: [{ id: "tag-1", name: "Work", color: "#ff0000" }],
              updatedAt: "2024-01-05T00:00:00Z",
            }),
            snippet: "a matching snippet",
          },
        ],
        total: 1,
      }),
    );

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");
    await user.type(input, "tagged");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    expect(await screen.findByText("Tagged note")).toBeInTheDocument();
    expect(screen.getByText("#Work")).toBeInTheDocument();
    expect(
      screen.getByText(`Updated ${new Date("2024-01-05T00:00:00Z").toLocaleString()}`),
    ).toBeInTheDocument();
  });

  it("Matched keywords in a snippet are visually highlighted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(searchApi.search).mockResolvedValue(
      makeSearchResponse({
        items: [
          {
            note: makeNote(),
            snippet: "before <mark>matched</mark> after",
          },
        ],
        total: 1,
      }),
    );

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");
    await user.type(input, "matched");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    await waitFor(() => {
      const mark = document.querySelector("mark");
      expect(mark).not.toBeNull();
      expect(mark?.textContent).toBe("matched");
    });
  });

  it("Before any search, an explicit prompt is shown", async () => {
    renderWithProviders(<AppRoutes />, ["/search"]);

    expect(
      await screen.findByText("Search for something to find your notes."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No notes matched your search.")).not.toBeInTheDocument();
  });

  it("A query with no matches shows an explicit no-results message", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(searchApi.search).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");
    await user.type(input, "nomatches");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    expect(await screen.findByText("No notes matched your search.")).toBeInTheDocument();
    expect(
      screen.queryByText("Search for something to find your notes."),
    ).not.toBeInTheDocument();
  });

  it("Navigating to the next page requests the next page of search results", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(searchApi.search).mockResolvedValue(makeSearchResponse({ total: 45 }));

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");
    await user.type(input, "many");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(searchApi.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "many", page: 2 }),
      );
    });
  });

  it("Previous is disabled on the first page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");
    await user.type(input, "hello");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    const previousButton = await screen.findByRole("button", { name: "Previous" });
    expect(previousButton).toBeDisabled();
  });

  it("Next is disabled on the last page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(searchApi.search).mockResolvedValue(makeSearchResponse({ total: 1 }));

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");
    await user.type(input, "hello");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    const nextButton = await screen.findByRole("button", { name: "Next" });
    expect(nextButton).toBeDisabled();
  });

  it("Clicking a search result navigates to that note's editor", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const note = makeNote({ id: "note-42", title: "Findable note" });
    vi.mocked(searchApi.search).mockResolvedValue(
      makeSearchResponse({ items: [{ note, snippet: "a matching snippet" }], total: 1 }),
    );
    vi.mocked(notesApi.getNote).mockResolvedValue(note);

    renderWithProviders(<AppRoutes />, ["/search"]);

    const input = screen.getByLabelText("Search notes");
    await user.type(input, "findable");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    const resultLink = await screen.findByText("Findable note");
    await user.click(resultLink);

    expect(await screen.findByDisplayValue("Findable note")).toBeInTheDocument();
  });
});
