import type { TagListItem, TagListResponse, TagSummary } from "@note-taking-app/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export class DuplicateTagNameError extends Error {}
export class TagNotFoundError extends Error {}

interface TagRecord {
  id: string;
  name: string;
  color: string | null;
  createdAt: Date;
}

function toTagSummary(tag: TagRecord): TagSummary {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
  };
}

export async function createTag(
  userId: string,
  name: string,
  color?: string,
): Promise<TagListItem> {
  try {
    const tag = await prisma.tag.create({ data: { userId, name, color } });
    return { ...toTagSummary(tag), noteCount: 0 };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateTagNameError();
    }
    throw err;
  }
}

export async function listTags(userId: string): Promise<TagListResponse> {
  const tags = await prisma.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { _count: { select: { notes: { where: { deletedAt: null } } } } },
  });

  return {
    items: tags.map((tag) => ({ ...toTagSummary(tag), noteCount: tag._count.notes })),
  };
}

export async function updateTag(
  userId: string,
  tagId: string,
  updates: { name?: string; color?: string },
): Promise<TagSummary> {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) {
    throw new TagNotFoundError();
  }

  try {
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.color !== undefined ? { color: updates.color } : {}),
      },
    });
    return toTagSummary(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateTagNameError();
    }
    throw err;
  }
}

export async function deleteTag(userId: string, tagId: string): Promise<void> {
  const result = await prisma.tag.deleteMany({ where: { id: tagId, userId } });
  if (result.count === 0) {
    throw new TagNotFoundError();
  }
}
