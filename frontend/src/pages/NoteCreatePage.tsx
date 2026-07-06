import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { createNote } from "@/lib/notesApi";
import { emptyContentJson } from "@/lib/tiptapContent";

export function NoteCreatePage() {
  const navigate = useNavigate();
  const hasCreated = useRef(false);

  const createMutation = useMutation({
    mutationFn: () => createNote({ title: "Untitled", content: emptyContentJson() }),
    onSuccess: (note) => {
      navigate(`/notes/${note.id}`, { replace: true });
    },
  });

  useEffect(() => {
    if (!hasCreated.current) {
      hasCreated.current = true;
      createMutation.mutate();
    }
  }, []);

  if (createMutation.isError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <p>Something went wrong creating your note.</p>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
              hasCreated.current = true;
              createMutation.mutate();
            }}
          >
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/notes")}>
            Back to notes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <p>Creating note...</p>
    </div>
  );
}
