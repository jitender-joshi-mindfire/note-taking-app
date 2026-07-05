import { z } from "zod";

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be a 6-digit hex string like #RRGGBB");

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: hexColorSchema.optional(),
});

export const updateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    color: hexColorSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: "At least one of name or color must be provided",
  });

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export interface TagRef {
  id: string;
  name: string;
  color: string | null;
}

export interface TagSummary extends TagRef {
  createdAt: string;
}

export interface TagListItem extends TagSummary {
  noteCount: number;
}

export interface TagListResponse {
  items: TagListItem[];
}
