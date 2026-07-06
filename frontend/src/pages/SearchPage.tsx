import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { search } from "@/lib/searchApi";
import { parseSnippet } from "@/lib/searchSnippet";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 400;

export function SearchPage() {
  const [q, setQ] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(q.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const searchQuery = useQuery({
    queryKey: ["search", { q: debouncedQuery, page, pageSize: PAGE_SIZE }],
    queryFn: () => search({ q: debouncedQuery, page, pageSize: PAGE_SIZE }),
    enabled: debouncedQuery.length > 0,
  });

  const total = searchQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Search</h1>
        <Button asChild variant="outline">
          <Link to="/notes">Back to notes</Link>
        </Button>
      </div>

      <input
        aria-label="Search notes"
        placeholder="Search your notes..."
        className="w-full border-b p-2 text-lg outline-none"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />

      {debouncedQuery.length === 0 && <p>Search for something to find your notes.</p>}

      {debouncedQuery.length > 0 && searchQuery.isLoading && <p>Searching...</p>}

      {debouncedQuery.length > 0 &&
        searchQuery.data &&
        searchQuery.data.items.length === 0 && <p>No notes matched your search.</p>}

      {searchQuery.data && searchQuery.data.items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {searchQuery.data.items.map(({ note, snippet }) => (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                className="block rounded-md border p-3 hover:bg-accent"
              >
                <p className="font-medium">{note.title}</p>
                <p className="text-sm text-muted-foreground">
                  {parseSnippet(snippet).map((segment, index) =>
                    segment.highlighted ? (
                      <mark key={index}>{segment.text}</mark>
                    ) : (
                      <span key={index}>{segment.text}</span>
                    ),
                  )}
                </p>
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

      {searchQuery.data && searchQuery.data.items.length > 0 && (
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
