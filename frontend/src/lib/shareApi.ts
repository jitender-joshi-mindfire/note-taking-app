import type { GenerateShareLinkInput, ShareLinkSummary } from "@note-taking-app/shared";
import { authenticatedFetch } from "./apiClient";

export async function generateShareLink(
  noteId: string,
  input: GenerateShareLinkInput,
): Promise<ShareLinkSummary> {
  return authenticatedFetch<ShareLinkSummary>(`/notes/${noteId}/share`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeShareLink(noteId: string): Promise<void> {
  await authenticatedFetch<void>(`/notes/${noteId}/share`, {
    method: "DELETE",
  });
}
