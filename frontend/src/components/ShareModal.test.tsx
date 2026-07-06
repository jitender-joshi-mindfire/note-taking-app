import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteSummary, ShareLinkRef, ShareLinkSummary } from "@note-taking-app/shared";
import { ShareModal } from "@/components/ShareModal";
import * as shareApi from "@/lib/shareApi";

vi.mock("@/lib/shareApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shareApi")>();
  return {
    ...actual,
    generateShareLink: vi.fn(),
    revokeShareLink: vi.fn(),
  };
});

function makeNote(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "note-1",
    title: "First note",
    content: JSON.stringify({ type: "doc", content: [] }),
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    tags: [],
    shareLink: null,
    ...overrides,
  };
}

function makeShareLink(overrides: Partial<ShareLinkRef> = {}): ShareLinkRef {
  return {
    token: "token-1",
    url: "https://example.com/share/token-1",
    expiresAt: "2024-02-01T00:00:00Z",
    viewCount: 0,
    ...overrides,
  };
}

function renderModal(note: NoteSummary, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ShareModal note={note} open={true} onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe("ShareModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A note with no active link shows the expiry-selection UI", () => {
    renderModal(makeNote({ shareLink: null }));

    expect(screen.getByText("This note has no active share link.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90 days" })).toBeInTheDocument();

    expect(screen.queryByText(/views$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Expires/)).not.toBeInTheDocument();
  });

  it("Generating a link for a note with no existing link shows the new link immediately", async () => {
    const user = userEvent.setup();
    const link: ShareLinkSummary = {
      token: "new-token",
      url: "https://example.com/share/new-token",
      expiresAt: "2024-03-01T00:00:00Z",
    };
    vi.mocked(shareApi.generateShareLink).mockResolvedValue(link);

    renderModal(makeNote({ shareLink: null }));

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText(link.url)).toBeInTheDocument();
    expect(
      screen.getByText(`Expires ${new Date(link.expiresAt).toLocaleDateString()} · 0 views`),
    ).toBeInTheDocument();
    expect(shareApi.generateShareLink).toHaveBeenCalledWith("note-1", { expiresInDays: 7 });
  });

  it("Generating a new link when one already exists shows a confirmation first", async () => {
    const user = userEvent.setup();
    const existing = makeShareLink();
    renderModal(makeNote({ shareLink: existing }));

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(
      screen.getByText("This will invalidate the current link. Continue?"),
    ).toBeInTheDocument();
    expect(shareApi.generateShareLink).not.toHaveBeenCalled();
  });

  it("Confirming the regeneration replaces the link and shows the new one", async () => {
    const user = userEvent.setup();
    const existing = makeShareLink({
      url: "https://example.com/share/old-token",
    });
    const newLink: ShareLinkSummary = {
      token: "new-token",
      url: "https://example.com/share/new-token",
      expiresAt: "2024-04-01T00:00:00Z",
    };
    vi.mocked(shareApi.generateShareLink).mockResolvedValue(newLink);

    renderModal(makeNote({ shareLink: existing }));

    await user.click(screen.getByRole("button", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(newLink.url)).toBeInTheDocument();
    expect(screen.queryByText(existing.url)).not.toBeInTheDocument();
  });

  it("A note with an active link shows its URL, expiry, and view count", () => {
    const link = makeShareLink({ viewCount: 5 });
    renderModal(makeNote({ shareLink: link }));

    expect(screen.getByText(link.url)).toBeInTheDocument();
    expect(
      screen.getByText(`Expires ${new Date(link.expiresAt).toLocaleDateString()} · 5 views`),
    ).toBeInTheDocument();
  });

  it("Clicking Copy copies the link and shows confirmation feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const link = makeShareLink();
    renderModal(makeNote({ shareLink: link }));

    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(link.url);
    });
    expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });

  it("Revoking requires confirmation before the request fires", async () => {
    const user = userEvent.setup();
    const link = makeShareLink();
    renderModal(makeNote({ shareLink: link }));

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(
      screen.getByText("Revoke this link? It will stop working immediately."),
    ).toBeInTheDocument();
    expect(shareApi.revokeShareLink).not.toHaveBeenCalled();
  });

  it("Confirming revocation removes the active link and returns to the no-link state", async () => {
    const user = userEvent.setup();
    const link = makeShareLink();
    vi.mocked(shareApi.revokeShareLink).mockResolvedValue(undefined);
    renderModal(makeNote({ shareLink: link }));

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Confirm revoke" }));

    expect(
      await screen.findByText("This note has no active share link."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 days" })).toBeInTheDocument();
    expect(screen.queryByText(link.url)).not.toBeInTheDocument();
    expect(screen.queryByText(/views$/)).not.toBeInTheDocument();
  });

  it("Cancelling the regenerate confirmation returns to the active-link view without calling generate (beyond spec)", async () => {
    const user = userEvent.setup();
    const existing = makeShareLink();
    renderModal(makeNote({ shareLink: existing }));

    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(
      screen.getByText("This will invalidate the current link. Continue?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("This will invalidate the current link. Continue?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(existing.url)).toBeInTheDocument();
    expect(shareApi.generateShareLink).not.toHaveBeenCalled();
  });

  it("Cancelling the revoke confirmation returns to the active-link view without calling revoke (beyond spec)", async () => {
    const user = userEvent.setup();
    const link = makeShareLink();
    renderModal(makeNote({ shareLink: link }));

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(
      screen.getByText("Revoke this link? It will stop working immediately."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Revoke this link? It will stop working immediately."),
    ).not.toBeInTheDocument();
    expect(screen.getByText(link.url)).toBeInTheDocument();
    expect(shareApi.revokeShareLink).not.toHaveBeenCalled();
  });
});
