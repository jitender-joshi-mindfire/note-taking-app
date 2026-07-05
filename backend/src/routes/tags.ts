import { type Router as RouterType, Router } from "express";
import { createTagSchema, updateTagSchema } from "@note-taking-app/shared";
import { validationError } from "../lib/validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createTag,
  deleteTag,
  DuplicateTagNameError,
  listTags,
  TagNotFoundError,
  updateTag,
} from "../services/TagService.js";

export const tagsRouter: RouterType = Router();

tagsRouter.use(requireAuth);

tagsRouter.post("/", async (req, res) => {
  const parsed = createTagSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid tag data", parsed.error.issues));
    return;
  }

  try {
    const tag = await createTag(req.userId as string, parsed.data.name, parsed.data.color);
    res.status(201).json({ tag });
  } catch (err) {
    if (err instanceof DuplicateTagNameError) {
      res
        .status(409)
        .json({ error: { code: "DUPLICATE_TAG_NAME", message: "Tag name already exists" } });
      return;
    }
    throw err;
  }
});

tagsRouter.get("/", async (req, res) => {
  const result = await listTags(req.userId as string);
  res.status(200).json(result);
});

tagsRouter.patch("/:id", async (req, res) => {
  const parsed = updateTagSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid tag data", parsed.error.issues));
    return;
  }

  try {
    const tag = await updateTag(req.userId as string, req.params.id as string, parsed.data);
    res.status(200).json({ tag });
  } catch (err) {
    if (err instanceof TagNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Tag not found" } });
      return;
    }
    if (err instanceof DuplicateTagNameError) {
      res
        .status(409)
        .json({ error: { code: "DUPLICATE_TAG_NAME", message: "Tag name already exists" } });
      return;
    }
    throw err;
  }
});

tagsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteTag(req.userId as string, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    if (err instanceof TagNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Tag not found" } });
      return;
    }
    throw err;
  }
});
