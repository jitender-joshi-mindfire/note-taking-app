import type { PublicNoteView, ShareLinkSummary } from "@note-taking-app/shared";
import { generateRefreshToken } from "../lib/hash.js";
import { prisma } from "../lib/prisma.js";
import { buildShareUrl } from "../lib/shareUrl.js";
import { NoteNotFoundError } from "./NoteService.js";

export class ShareLinkNotFoundError extends Error {}
export class ShareLinkExpiredError extends Error {}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function generateShareLink(
  userId: string,
  noteId: string,
  expiresInDays: number,
): Promise<ShareLinkSummary> {
  const note = await prisma.note.findFirst({ where: { id: noteId, userId, deletedAt: null } });
  if (!note) {
    throw new NoteNotFoundError();
  }

  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + expiresInDays * MS_PER_DAY);

  const link = await prisma.shareLink.upsert({
    where: { noteId },
    create: { noteId, token, expiresAt },
    update: { token, expiresAt, viewCount: 0, revokedAt: null },
  });

  return {
    token: link.token,
    url: buildShareUrl(link.token),
    expiresAt: link.expiresAt.toISOString(),
  };
}

export async function revokeShareLink(userId: string, noteId: string): Promise<void> {
  const note = await prisma.note.findFirst({ where: { id: noteId, userId, deletedAt: null } });
  if (!note) {
    throw new NoteNotFoundError();
  }

  const result = await prisma.shareLink.updateMany({
    where: { noteId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new ShareLinkNotFoundError();
  }
}

export async function viewSharedNote(token: string): Promise<PublicNoteView> {
  const now = new Date();

  // Atomically claim the view: the increment only applies if the link is valid at this
  // exact instant, closing the race where a link could expire/be revoked between a
  // separate check and a separate increment (design.md Decision 1).
  const claim = await prisma.shareLink.updateMany({
    where: { token, revokedAt: null, expiresAt: { gt: now } },
    data: { viewCount: { increment: 1 } },
  });

  if (claim.count === 0) {
    const link = await prisma.shareLink.findUnique({ where: { token } });
    if (!link || link.revokedAt) {
      throw new ShareLinkNotFoundError();
    }
    throw new ShareLinkExpiredError();
  }

  const link = await prisma.shareLink.findUniqueOrThrow({
    where: { token },
    include: { note: true },
  });

  return {
    title: link.note.title,
    content: link.note.content,
    updatedAt: link.note.updatedAt.toISOString(),
  };
}
