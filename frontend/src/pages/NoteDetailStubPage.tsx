import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { ApiError } from "@/lib/apiClient";
import { getNote } from "@/lib/notesApi";

export function NoteDetailStubPage() {
  const { id } = useParams<{ id: string }>();

  const noteQuery = useQuery({
    queryKey: ["note", id],
    queryFn: () => getNote(id!),
    enabled: Boolean(id),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  });

  if (noteQuery.isLoading) {
    return <p className="p-4">Loading note...</p>;
  }

  if (noteQuery.error instanceof ApiError && noteQuery.error.status === 404) {
    return <p className="p-4">Note not found.</p>;
  }

  if (!noteQuery.data) {
    return <p className="p-4">Something went wrong loading this note.</p>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{noteQuery.data.title}</h1>
      <p className="whitespace-pre-wrap">{noteQuery.data.content}</p>
      <p className="text-sm text-muted-foreground">
        Editing arrives in AB-1012 — this is a read-only preview.
      </p>
    </div>
  );
}
