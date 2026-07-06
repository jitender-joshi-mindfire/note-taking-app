import type {
  CreateNoteInput,
  ListNotesQuery,
  NoteListResponse,
  NoteSummary,
  UpdateNoteInput,
} from "@note-taking-app/shared";
import { authenticatedFetch } from "./apiClient";

export async function listNotes(query: ListNotesQuery): Promise<NoteListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("sortBy", query.sortBy);
  params.set("sortDir", query.sortDir);
  query.tagIds.forEach((id) => params.append("tagIds", id));

  return authenticatedFetch<NoteListResponse>(`/notes?${params.toString()}`);
}

export async function getNote(id: string): Promise<NoteSummary> {
  const body = await authenticatedFetch<{ note: NoteSummary }>(`/notes/${id}`);
  return body.note;
}

export async function createNote(input: CreateNoteInput): Promise<NoteSummary> {
  const body = await authenticatedFetch<{ note: NoteSummary }>("/notes", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.note;
}

export async function updateNote(id: string, input: UpdateNoteInput): Promise<NoteSummary> {
  const body = await authenticatedFetch<{ note: NoteSummary }>(`/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return body.note;
}
