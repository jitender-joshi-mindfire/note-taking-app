import { type Router as RouterType, Router } from "express";
import {
  ShareLinkExpiredError,
  ShareLinkNotFoundError,
  viewSharedNote,
} from "../services/ShareService.js";

export const shareRouter: RouterType = Router();

shareRouter.get("/:token", async (req, res) => {
  try {
    const note = await viewSharedNote(req.params.token as string);
    res.status(200).json(note);
  } catch (err) {
    if (err instanceof ShareLinkNotFoundError) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Share link not found" } });
      return;
    }
    if (err instanceof ShareLinkExpiredError) {
      res.status(410).json({ error: { code: "GONE", message: "Share link has expired" } });
      return;
    }
    throw err;
  }
});
