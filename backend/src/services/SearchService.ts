import type { SearchQuery, SearchResponse, SearchResultItem } from "@note-taking-app/shared";
import { prisma } from "../lib/prisma.js";
import { toNoteSummary } from "./NoteService.js";

const MAX_PAGE_SIZE = 100;

interface RankedRow {
  id: string;
  snippet: string;
}

interface CountRow {
  count: bigint;
}

export async function searchNotes(userId: string, query: SearchQuery): Promise<SearchResponse> {
  const page = query.page;
  const pageSize = Math.min(query.pageSize, MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const rows = await prisma.$queryRaw<RankedRow[]>`
    SELECT n.id,
           ts_headline(
             'english',
             n.content,
             query,
             'StartSel=<mark>, StopSel=</mark>, MaxFragments=2'
           ) AS snippet
    FROM "Note" n, websearch_to_tsquery('english', ${query.q}) AS query
    WHERE n."userId" = ${userId}
      AND n."deletedAt" IS NULL
      AND n."searchVector" @@ query
    ORDER BY ts_rank(n."searchVector", query) DESC, n."updatedAt" DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Note" n, websearch_to_tsquery('english', ${query.q}) AS query
    WHERE n."userId" = ${userId}
      AND n."deletedAt" IS NULL
      AND n."searchVector" @@ query
  `;
  const total = Number(countRows[0]?.count ?? 0n);

  if (rows.length === 0) {
    return { items: [], total, page, pageSize };
  }

  const ids = rows.map((row) => row.id);
  const notes = await prisma.note.findMany({
    where: { id: { in: ids } },
    include: { tags: true },
  });
  const noteById = new Map(notes.map((note) => [note.id, note]));

  const items: SearchResultItem[] = [];
  for (const row of rows) {
    const note = noteById.get(row.id);
    if (note) {
      items.push({ note: toNoteSummary(note), snippet: row.snippet });
    }
  }

  return { items, total, page, pageSize };
}
