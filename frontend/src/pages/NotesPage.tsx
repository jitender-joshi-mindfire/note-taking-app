import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { logout as logoutRequest } from "@/lib/authApi";
import { listNotes } from "@/lib/notesApi";
import { listTags } from "@/lib/tagsApi";
import { useAuthStore } from "@/store/authStore";

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { label: "Recently updated", sortBy: "updatedAt", sortDir: "desc" },
  { label: "Newest first", sortBy: "createdAt", sortDir: "desc" },
  { label: "Oldest first", sortBy: "createdAt", sortDir: "asc" },
  { label: "Title A–Z", sortBy: "title", sortDir: "asc" },
  { label: "Title Z–A", sortBy: "title", sortDir: "desc" },
] as const;

function contentPreview(content: string): string {
  return content.length > 140 ? `${content.slice(0, 140)}…` : content;
}

export function NotesPage() {
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const logout = useAuthStore((state) => state.logout);

  const [page, setPage] = useState(1);
  const [sortIndex, setSortIndex] = useState(0);
  const [tagIds, setTagIds] = useState<string[]>([]);

  const { sortBy, sortDir } = SORT_OPTIONS[sortIndex] ?? SORT_OPTIONS[0];

  const logoutMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        return Promise.resolve();
      }
      return logoutRequest(session.accessToken, session.refreshToken);
    },
    onSettled: () => {
      logout();
      navigate("/login");
    },
  });

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: listTags,
  });

  const notesQuery = useQuery({
    queryKey: ["notes", { page, pageSize: PAGE_SIZE, sortBy, sortDir, tagIds }],
    queryFn: () => listNotes({ page, pageSize: PAGE_SIZE, sortBy, sortDir, tagIds }),
  });

  function handleSortChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setSortIndex(Number(event.target.value));
    setPage(1);
  }

  function toggleTag(tagId: string) {
    setTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
    setPage(1);
  }

  const total = notesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <p>Logged in as {session?.user.email}</p>
        <Button onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
          {logoutMutation.isPending ? "Logging out..." : "Log out"}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notes</h1>
        <Button asChild>
          <Link to="/notes/new">New note</Link>
        </Button>
      </div>

      {tagsQuery.data && tagsQuery.data.items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tagsQuery.data.items.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={
                tagIds.includes(tag.id)
                  ? "rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
                  : "rounded-full border px-3 py-1 text-sm"
              }
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="sort-select">Sort by</label>
        <select id="sort-select" value={sortIndex} onChange={handleSortChange}>
          {SORT_OPTIONS.map((option, index) => (
            <option key={option.label} value={index}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {notesQuery.isLoading && <p>Loading notes...</p>}

      {notesQuery.data && notesQuery.data.items.length === 0 && <p>No notes yet.</p>}

      {notesQuery.data && notesQuery.data.items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {notesQuery.data.items.map((note) => (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                className="block rounded-md border p-3 hover:bg-accent"
              >
                <p className="font-medium">{note.title}</p>
                <p className="text-sm text-muted-foreground">{contentPreview(note.content)}</p>
                {note.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <span key={tag.id} className="text-xs text-muted-foreground">
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {new Date(note.updatedAt).toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {notesQuery.data && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
