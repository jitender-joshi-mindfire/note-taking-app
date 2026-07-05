import { z } from "zod";

export const generateShareLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365),
});

export type GenerateShareLinkInput = z.infer<typeof generateShareLinkSchema>;

export interface ShareLinkSummary {
  token: string;
  url: string;
  expiresAt: string;
}

export interface ShareLinkRef extends ShareLinkSummary {
  viewCount: number;
}

export interface PublicNoteView {
  title: string;
  content: string;
  updatedAt: string;
}
