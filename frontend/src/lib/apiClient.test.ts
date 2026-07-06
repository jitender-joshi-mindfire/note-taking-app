import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setSession() {
  useAuthStore.setState({
    session: {
      user: { id: "1", email: "a@b.com", createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "initial-access-token",
      refreshToken: "initial-refresh-token",
    },
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ session: null });
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("A request includes the current access token", async () => {
    setSession();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await authenticatedFetch("/notes");

    expect(fetch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetch).mock.calls[0];
    if (!call) {
      throw new Error("Expected fetch to have been called");
    }
    const [, init] = call;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer initial-access-token");
  });

  it("Expired access token triggers a silent refresh and retry", async () => {
    setSession();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "new-access-token", refreshToken: "new-refresh-token" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { items: [] }));

    await authenticatedFetch("/notes");

    expect(fetch).toHaveBeenCalledTimes(3);
    const [firstCall, refreshCall, retryCall] = vi.mocked(fetch).mock.calls;
    if (!firstCall || !refreshCall || !retryCall) {
      throw new Error("Expected fetch to have been called three times");
    }
    expect(firstCall[0]).toBe(`${API_BASE_URL}/notes`);
    expect(refreshCall[0]).toBe(`${API_BASE_URL}/auth/refresh`);
    expect(retryCall[0]).toBe(`${API_BASE_URL}/notes`);
    const retryHeaders = retryCall[1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer new-access-token");
  });

  it("The retried request's response is returned to the caller", async () => {
    setSession();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "new-access-token", refreshToken: "new-refresh-token" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { items: [{ id: "note-1" }] }));

    const result = await authenticatedFetch<{ items: { id: string }[] }>("/notes");

    expect(result).toEqual({ items: [{ id: "note-1" }] });
  });

  it("Refresh failure clears the session and redirects to login", async () => {
    setSession();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }))
      .mockResolvedValueOnce(jsonResponse(400, { error: { code: "REFRESH_FAILED" } }));

    await expect(authenticatedFetch("/notes")).rejects.toThrow();

    expect(useAuthStore.getState().session).toBeNull();
  });

  it("A second 401 after a successful refresh is treated as a final failure", async () => {
    setSession();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "new-access-token", refreshToken: "new-refresh-token" }),
      )
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }));

    await expect(authenticatedFetch("/notes")).rejects.toThrow();

    expect(useAuthStore.getState().session).toBeNull();
    const refreshCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });

  it("Two concurrent 401s trigger exactly one refresh call", async () => {
    setSession();

    // Only the first call to each endpoint 401s; subsequent (retried) calls succeed.
    let notesCallCount = 0;
    let tagsCallCount = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return Promise.resolve(
          jsonResponse(200, { accessToken: "new-access-token", refreshToken: "new-refresh-token" }),
        );
      }
      if (url.includes("/notes")) {
        notesCallCount += 1;
        return Promise.resolve(
          notesCallCount === 1
            ? jsonResponse(401, { error: { code: "UNAUTHENTICATED" } })
            : jsonResponse(200, { items: [] }),
        );
      }
      if (url.includes("/tags")) {
        tagsCallCount += 1;
        return Promise.resolve(
          tagsCallCount === 1
            ? jsonResponse(401, { error: { code: "UNAUTHENTICATED" } })
            : jsonResponse(200, { items: [] }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch to ${url}`));
    });

    const [notesResult, tagsResult] = await Promise.all([
      authenticatedFetch("/notes"),
      authenticatedFetch("/tags"),
    ]);

    expect(notesResult).toEqual({ items: [] });
    expect(tagsResult).toEqual({ items: [] });

    const refreshCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });
});
