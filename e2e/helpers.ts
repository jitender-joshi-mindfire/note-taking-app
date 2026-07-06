import type { APIRequestContext, Page } from "@playwright/test";

export const API_BASE_URL = "http://localhost:3200/api";

const EMPTY_TIPTAP_CONTENT = JSON.stringify({ type: "doc", content: [] });

export function uniqueEmail(): string {
  return `journey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function getAccessToken(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem("note-app-session"));
  if (!raw) {
    throw new Error("No session found in localStorage — expected the user to be logged in");
  }
  const session = JSON.parse(raw) as { accessToken: string };
  return session.accessToken;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function seedTagOnNote(
  request: APIRequestContext,
  accessToken: string,
  noteId: string,
  tagName: string,
): Promise<void> {
  const tagResponse = await request.post(`${API_BASE_URL}/tags`, {
    headers: authHeaders(accessToken),
    data: { name: tagName },
  });
  if (!tagResponse.ok()) {
    throw new Error(`Failed to create tag: ${tagResponse.status()} ${await tagResponse.text()}`);
  }
  const { tag } = (await tagResponse.json()) as { tag: { id: string } };

  const attachResponse = await request.patch(`${API_BASE_URL}/notes/${noteId}`, {
    headers: authHeaders(accessToken),
    data: { tagIds: [tag.id] },
  });
  if (!attachResponse.ok()) {
    throw new Error(
      `Failed to attach tag to note: ${attachResponse.status()} ${await attachResponse.text()}`,
    );
  }
}

export async function seedUntaggedNote(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ id: string }> {
  const response = await request.post(`${API_BASE_URL}/notes`, {
    headers: authHeaders(accessToken),
    data: { title: "Untagged fixture note", content: EMPTY_TIPTAP_CONTENT },
  });
  if (!response.ok()) {
    throw new Error(`Failed to create fixture note: ${response.status()} ${await response.text()}`);
  }
  const { note } = (await response.json()) as { note: { id: string } };
  return { id: note.id };
}
