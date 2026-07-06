import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteVersionSummary } from "@note-taking-app/shared";
import { VersionHistoryModal } from "@/components/VersionHistoryModal";
import * as versionsApi from "@/lib/versionsApi";

vi.mock("@/lib/versionsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/versionsApi")>();
  return {
    ...actual,
    listVersions: vi.fn(),
    restoreVersion: vi.fn(),
  };
});

function makeVersion(overrides: Partial<NoteVersionSummary> = {}): NoteVersionSummary {
  return {
    id: "version-1",
    title: "Version title",
    content: JSON.stringify({ type: "doc", content: [] }),
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderModal(noteId = "note-1", onClose = vi.fn(), onRestored = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <VersionHistoryModal noteId={noteId} open={true} onClose={onClose} onRestored={onRestored} />
    </QueryClientProvider>,
  );
}

describe("VersionHistoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Versions are listed newest first, each showing title and timestamp", async () => {
    const versions: NoteVersionSummary[] = [
      makeVersion({ id: "v-3", title: "Newest version", createdAt: "2024-03-01T00:00:00Z" }),
      makeVersion({ id: "v-2", title: "Middle version", createdAt: "2024-02-01T00:00:00Z" }),
      makeVersion({ id: "v-1", title: "Oldest version", createdAt: "2024-01-01T00:00:00Z" }),
    ];
    vi.mocked(versionsApi.listVersions).mockResolvedValue(versions);

    renderModal();

    expect(await screen.findByText("Newest version")).toBeInTheDocument();
    expect(screen.getByText("Middle version")).toBeInTheDocument();
    expect(screen.getByText("Oldest version")).toBeInTheDocument();

    for (const version of versions) {
      expect(
        screen.getByText(new Date(version.createdAt).toLocaleString()),
      ).toBeInTheDocument();
    }

    const titles = screen
      .getAllByText(/version$/i)
      .map((element) => element.textContent);
    expect(titles).toEqual(["Newest version", "Middle version", "Oldest version"]);
  });

  it("Selecting a version shows its title and content as plain text", async () => {
    const user = userEvent.setup();
    const version = makeVersion({
      title: "Old title",
      content: JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Old body text" }] }],
      }),
    });
    vi.mocked(versionsApi.listVersions).mockResolvedValue([version]);

    renderModal();

    const entry = await screen.findByText("Old title");
    await user.click(entry);

    expect(await screen.findByText("Old body text")).toBeInTheDocument();
  });

  it("Restoring requires confirmation before the request fires", async () => {
    const user = userEvent.setup();
    const version = makeVersion();
    vi.mocked(versionsApi.listVersions).mockResolvedValue([version]);

    renderModal();

    await user.click(await screen.findByText(version.title));
    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(
      screen.getByText("Restore this version? Your current title and content will be replaced."),
    ).toBeInTheDocument();
    expect(versionsApi.restoreVersion).not.toHaveBeenCalled();
  });

  it("Cancelling the restore confirmation returns to the version preview without calling restore (beyond spec)", async () => {
    const user = userEvent.setup();
    const version = makeVersion();
    vi.mocked(versionsApi.listVersions).mockResolvedValue([version]);

    renderModal();

    await user.click(await screen.findByText(version.title));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      screen.getByText("Restore this version? Your current title and content will be replaced."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Restore this version? Your current title and content will be replaced."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(versionsApi.restoreVersion).not.toHaveBeenCalled();
  });
});
