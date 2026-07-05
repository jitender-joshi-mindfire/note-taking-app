import { type Router as RouterType, Router } from "express";
import {
  createNoteSchema,
  generateShareLinkSchema,
  listNotesQuerySchema,
  updateNoteSchema,
} from "@note-taking-app/shared";
import { validationError } from "../lib/validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createNote,
  deleteNote,
  getNote,
  InvalidTagIdsError,
  listNotes,
  NoteNotFoundError,
  updateNote,
} from "../services/NoteService.js";
import {
  generateShareLink,
  revokeShareLink,
  ShareLinkNotFoundError,
} from "../services/ShareService.js";

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
  const parsed = listNotesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid query parameters", parsed.error.issues));
    return;
  }

  const result = await listNotes(req.userId as string, parsed.data);
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
    if (err instanceof InvalidTagIdsError) {
      res.status(400).json({
        error: { code: "INVALID_TAG_IDS", message: "One or more tagIds do not exist or are not owned by you" },
      });
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

notesRouter.post("/:id/share", async (req, res) => {
  const parsed = generateShareLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid share request", parsed.error.issues));
    return;
  }

  try {
    const link = await generateShareLink(
      req.userId as string,
      req.params.id as string,
      parsed.data.expiresInDays,
    );
    res.status(201).json(link);
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Note not found" } });
      return;
    }
    throw err;
  }
});

notesRouter.delete("/:id/share", async (req, res) => {
  try {
    await revokeShareLink(req.userId as string, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    if (err instanceof NoteNotFoundError || err instanceof ShareLinkNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Share link not found" } });
      return;
    }
    throw err;
  }
});
