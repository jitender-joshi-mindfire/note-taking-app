import type { SearchQuery, SearchResponse } from "@note-taking-app/shared";
import { authenticatedFetch } from "./apiClient";

export async function search(query: SearchQuery): Promise<SearchResponse> {
  const params = new URLSearchParams();
  params.set("q", query.q);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));

  return authenticatedFetch<SearchResponse>(`/search?${params.toString()}`);
}
