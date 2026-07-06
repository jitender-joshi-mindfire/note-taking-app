import type { ListNotesQuery, NoteListResponse, NoteSummary } from "@note-taking-app/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { buildShareUrl } from "../lib/shareUrl.js";

const MAX_PAGE_SIZE = 100;
const MAX_RETAINED_VERSIONS = 50;

export class NoteNotFoundError extends Error {}
export class InvalidTagIdsError extends Error {}

interface NoteRecord {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  tags: { id: string; name: string; color: string | null }[];
  shareLink: {
    token: string;
    expiresAt: Date;
    viewCount: number;
    revokedAt: Date | null;
  } | null;
}

export function toNoteSummary(note: NoteRecord): NoteSummary {
  const activeShareLink =
    note.shareLink && note.shareLink.revokedAt === null && note.shareLink.expiresAt > new Date()
      ? note.shareLink
      : null;

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    tags: note.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
    shareLink: activeShareLink
      ? {
          token: activeShareLink.token,
          url: buildShareUrl(activeShareLink.token),
          expiresAt: activeShareLink.expiresAt.toISOString(),
          viewCount: activeShareLink.viewCount,
        }
      : null,
  };
}

export async function createNote(userId: string, title: string, content: string) {
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.note.create({ data: { userId, title, content } });
    await tx.noteVersion.create({
      data: { noteId: created.id, title: created.title, content: created.content },
    });
    return created;
  });

  return toNoteSummary({ ...note, tags: [], shareLink: null });
}

export async function listNotes(
  userId: string,
  query: ListNotesQuery,
): Promise<NoteListResponse> {
  const where: Prisma.NoteWhereInput = {
    userId,
    deletedAt: null,
    ...(query.tagIds.length > 0
      ? { AND: query.tagIds.map((tagId) => ({ tags: { some: { id: tagId } } })) }
      : {}),
  };
  const page = query.page;
  const pageSize = Math.min(query.pageSize, MAX_PAGE_SIZE);
  const orderBy: Prisma.NoteOrderByWithRelationInput = { [query.sortBy]: query.sortDir };

  const [items, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { tags: true, shareLink: true },
    }),
    prisma.note.count({ where }),
  ]);

  return {
    items: items.map(toNoteSummary),
    total,
    page,
    pageSize,
  };
}

export async function getNote(userId: string, noteId: string): Promise<NoteSummary> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
    include: { tags: true, shareLink: true },
  });

  if (!note) {
    throw new NoteNotFoundError();
  }

  return toNoteSummary(note);
}

export async function updateNote(
  userId: string,
  noteId: string,
  updates: { title?: string; content?: string; tagIds?: string[] },
): Promise<NoteSummary> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });

  if (!note) {
    throw new NoteNotFoundError();
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (updates.tagIds !== undefined) {
      const uniqueTagIds = [...new Set(updates.tagIds)];
      if (uniqueTagIds.length > 0) {
        const owned = await tx.tag.findMany({
          where: { id: { in: uniqueTagIds }, userId },
        });
        if (owned.length !== uniqueTagIds.length) {
          throw new InvalidTagIdsError();
        }
      }
    }

    await tx.noteVersion.create({
      data: { noteId: note.id, title: note.title, content: note.content },
    });

    const versionCount = await tx.noteVersion.count({ where: { noteId: note.id } });
    if (versionCount > MAX_RETAINED_VERSIONS) {
      const excess = await tx.noteVersion.findMany({
        where: { noteId: note.id },
        orderBy: { createdAt: "asc" },
        take: versionCount - MAX_RETAINED_VERSIONS,
        select: { id: true },
      });
      await tx.noteVersion.deleteMany({ where: { id: { in: excess.map((v) => v.id) } } });
    }

    return tx.note.update({
      where: { id: note.id },
      data: {
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.content !== undefined ? { content: updates.content } : {}),
        ...(updates.tagIds !== undefined
          ? { tags: { set: updates.tagIds.map((id) => ({ id })) } }
          : {}),
      },
      include: { tags: true, shareLink: true },
    });
  });

  return toNoteSummary(updated);
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.note.updateMany({
      where: { id: noteId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NoteNotFoundError();
    }

    // No-ops if there's no active share link — FRS 4.4.4.
    await tx.shareLink.updateMany({
      where: { noteId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}
