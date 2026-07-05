import { type Router as RouterType, Router } from "express";
import { searchQuerySchema } from "@note-taking-app/shared";
import { validationError } from "../lib/validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { searchNotes } from "../services/SearchService.js";

export const searchRouter: RouterType = Router();

searchRouter.use(requireAuth);

searchRouter.get("/", async (req, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(validationError("Invalid search query", parsed.error.issues));
    return;
  }

  const result = await searchNotes(req.userId as string, parsed.data);
  res.status(200).json(result);
});
