import type { NoteSummary, NoteVersionSummary } from "@note-taking-app/shared";
import { authenticatedFetch } from "./apiClient";

export async function listVersions(noteId: string): Promise<NoteVersionSummary[]> {
  const body = await authenticatedFetch<{ items: NoteVersionSummary[] }>(
    `/notes/${noteId}/versions`,
  );
  return body.items;
}

export async function restoreVersion(noteId: string, versionId: string): Promise<NoteSummary> {
  const body = await authenticatedFetch<{ note: NoteSummary }>(
    `/notes/${noteId}/versions/${versionId}/restore`,
    { method: "POST" },
  );
  return body.note;
}
