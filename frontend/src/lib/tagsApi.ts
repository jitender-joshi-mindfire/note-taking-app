import type { TagListResponse } from "@note-taking-app/shared";
import { authenticatedFetch } from "./apiClient";

export async function listTags(): Promise<TagListResponse> {
  return authenticatedFetch<TagListResponse>("/tags");
}
