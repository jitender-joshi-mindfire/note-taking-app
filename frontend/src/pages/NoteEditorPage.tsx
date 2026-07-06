import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/apiClient";
import { getNote, updateNote } from "@/lib/notesApi";
import { parseContent } from "@/lib/tiptapContent";

const AUTOSAVE_DELAY_MS = 2500;

function emptyDoc() {
  return { type: "doc" as const, content: [] };
}

export function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const noteQuery = useQuery({
    queryKey: ["note", id],
    queryFn: () => getNote(id!),
    enabled: Boolean(id),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  });

  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState(false);
  const hasInitialized = useRef(false);
  const isProgrammaticUpdate = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const retryQueuedRef = useRef(false);
  const titleRef = useRef(title);
  titleRef.current = title;

  const saveMutation = useMutation({
    mutationFn: (input: { title: string; content: string }) => updateNote(id!, input),
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: emptyDoc(),
    onUpdate: () => {
      if (isProgrammaticUpdate.current) {
        return;
      }
      scheduleSave();
    },
  });

  useEffect(() => {
    if (noteQuery.data && !hasInitialized.current && editor) {
      setTitle(noteQuery.data.title);
      isProgrammaticUpdate.current = true;
      editor.commands.setContent(parseContent(noteQuery.data.content));
      isProgrammaticUpdate.current = false;
      hasInitialized.current = true;
    }
  }, [noteQuery.data, editor]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function runSave(): Promise<void> {
    const content = JSON.stringify(editor?.getJSON() ?? emptyDoc());
    const chained = saveMutation
      .mutateAsync({ title: titleRef.current, content })
      .catch(() => {})
      .then(() => {
        inFlightRef.current = null;
        if (retryQueuedRef.current) {
          retryQueuedRef.current = false;
          if (titleRef.current.trim().length > 0) {
            setTitleError(false);
            return runSave();
          }
          setTitleError(true);
        }
        return undefined;
      });
    inFlightRef.current = chained;
    return chained;
  }

  function triggerSave() {
    if (titleRef.current.trim().length === 0) {
      setTitleError(true);
      return;
    }
    setTitleError(false);
    if (inFlightRef.current) {
      // A save is already in flight — queue exactly one retry (using the latest
      // title/content via refs) instead of firing a second, overlapping PATCH.
      retryQueuedRef.current = true;
      return;
    }
    void runSave();
  }

  function scheduleSave() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      triggerSave();
    }, AUTOSAVE_DELAY_MS);
  }

  function handleTitleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setTitle(event.target.value);
    if (event.target.value.trim().length > 0) {
      setTitleError(false);
    }
    scheduleSave();
  }

  async function handleBack() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      triggerSave();
    }
    if (inFlightRef.current) {
      await inFlightRef.current;
    }
    navigate("/notes");
  }

  if (noteQuery.isLoading) {
    return <p className="p-4">Loading note...</p>;
  }

  if (noteQuery.error instanceof ApiError && noteQuery.error.status === 404) {
    return <p className="p-4">Note not found.</p>;
  }

  if (!noteQuery.data) {
    return <p className="p-4">Something went wrong loading this note.</p>;
  }

  const toolbarButtons: {
    label: string;
    isActive: boolean;
    onClick: () => void;
  }[] = [
    {
      label: "Bold",
      isActive: Boolean(editor?.isActive("bold")),
      onClick: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      isActive: Boolean(editor?.isActive("italic")),
      onClick: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: "H1",
      isActive: Boolean(editor?.isActive("heading", { level: 1 })),
      onClick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "H2",
      isActive: Boolean(editor?.isActive("heading", { level: 2 })),
      onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Bullet list",
      isActive: Boolean(editor?.isActive("bulletList")),
      onClick: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      isActive: Boolean(editor?.isActive("orderedList")),
      onClick: () => editor?.chain().focus().toggleOrderedList().run(),
    },
  ];

  const saveStatusText = saveMutation.isPending
    ? "Saving..."
    : saveMutation.isSuccess
      ? "Saved"
      : saveMutation.isError
        ? "Save failed"
        : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={handleBack}>
          Back to notes
        </Button>
        <div className="text-sm text-muted-foreground">{saveStatusText}</div>
      </div>

      <input
        aria-label="Title"
        className="w-full border-b p-2 text-xl font-semibold outline-none"
        value={title}
        onChange={handleTitleChange}
      />
      {titleError && <p className="text-sm text-destructive">Title is required</p>}

      <div className="flex flex-wrap gap-1 border-b pb-2">
        {toolbarButtons.map((button) => (
          <Button
            key={button.label}
            type="button"
            size="sm"
            variant={button.isActive ? "secondary" : "outline"}
            onClick={button.onClick}
          >
            {button.label}
          </Button>
        ))}
      </div>

      <EditorContent editor={editor} className="min-h-[300px]" />
    </div>
  );
}
