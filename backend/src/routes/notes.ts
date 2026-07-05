import { type Router as RouterType, Router } from "express";
import { createNoteSchema, updateNoteSchema } from "@note-taking-app/shared";
import { validationError } from "../lib/validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  NoteNotFoundError,
  updateNote,
} from "../services/NoteService.js";

export const notesRouter: RouterType = Router();

notesRouter.use(requireAuth);

notesRouter.post("/", async (req, res) => {
  const parsed = createNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid note data", parsed.error.issues));
    return;
  }

  const note = await createNote(req.userId as string, parsed.data.title, parsed.data.content);
  res.status(201).json({ note });
});

notesRouter.get("/", async (req, res) => {
  const result = await listNotes(req.userId as string);
  res.status(200).json(result);
});

notesRouter.get("/:id", async (req, res) => {
  try {
    const note = await getNote(req.userId as string, req.params.id as string);
    res.status(200).json({ note });
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Note not found" } });
      return;
    }
    throw err;
  }
});

notesRouter.patch("/:id", async (req, res) => {
  const parsed = updateNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid note data", parsed.error.issues));
    return;
  }

  try {
    const note = await updateNote(req.userId as string, req.params.id as string, parsed.data);
    res.status(200).json({ note });
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Note not found" } });
      return;
    }
    throw err;
  }
});

notesRouter.delete("/:id", async (req, res) => {
  try {
    await deleteNote(req.userId as string, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Note not found" } });
      return;
    }
    throw err;
  }
});
