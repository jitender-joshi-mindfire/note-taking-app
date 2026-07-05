import { z } from "zod";

export const createNoteSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
  })
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: "At least one of title or content must be provided",
  });

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export interface NoteSummary {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListResponse {
  items: NoteSummary[];
  total: number;
  page: number;
  pageSize: number;
}
