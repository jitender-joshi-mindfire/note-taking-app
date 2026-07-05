import { z } from "zod";
import type { NoteSummary } from "./notes.js";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchResultItem {
  note: NoteSummary;
  snippet: string;
}

export interface SearchResponse {
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
}
