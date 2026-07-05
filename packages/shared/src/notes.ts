import { z } from "zod";
import type { ShareLinkRef } from "./sharing.js";
import type { TagRef } from "./tags.js";

export const createNoteSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined || data.content !== undefined || data.tagIds !== undefined,
    {
      message: "At least one of title, content, or tagIds must be provided",
    },
  );

const tagIdsQuerySchema = z
  .union([z.string().uuid(), z.array(z.string().uuid())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));

export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(20),
  sortBy: z.enum(["createdAt", "updatedAt", "title"]).default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  tagIds: tagIdsQuerySchema,
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;

export interface NoteSummary {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  tags: TagRef[];
  shareLink: ShareLinkRef | null;
}

export interface NoteListResponse {
  items: NoteSummary[];
  total: number;
  page: number;
  pageSize: number;
}
