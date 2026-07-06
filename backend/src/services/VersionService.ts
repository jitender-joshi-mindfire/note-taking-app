import type { NoteSummary, NoteVersionSummary } from "@note-taking-app/shared";
import { prisma } from "../lib/prisma.js";
import { NoteNotFoundError, updateNote } from "./NoteService.js";

export class VersionNotFoundError extends Error {}

interface VersionRecord {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
}

function toVersionSummary(version: VersionRecord): NoteVersionSummary {
  return {
    id: version.id,
    title: version.title,
    content: version.content,
    createdAt: version.createdAt.toISOString(),
  };
}

async function assertNoteOwnership(userId: string, noteId: string): Promise<void> {
  const note = await prisma.note.findFirst({ where: { id: noteId, userId, deletedAt: null } });
  if (!note) {
    throw new NoteNotFoundError();
  }
}

export async function listVersions(
  userId: string,
  noteId: string,
): Promise<NoteVersionSummary[]> {
  await assertNoteOwnership(userId, noteId);

  const versions = await prisma.noteVersion.findMany({
    where: { noteId },
    orderBy: { createdAt: "desc" },
  });

  return versions.map(toVersionSummary);
}

export async function getVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteVersionSummary> {
  await assertNoteOwnership(userId, noteId);

  const version = await prisma.noteVersion.findFirst({ where: { id: versionId, noteId } });
  if (!version) {
    throw new VersionNotFoundError();
  }

  return toVersionSummary(version);
}

export async function restoreVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteSummary> {
  await assertNoteOwnership(userId, noteId);

  const version = await prisma.noteVersion.findFirst({ where: { id: versionId, noteId } });
  if (!version) {
    throw new VersionNotFoundError();
  }

  return updateNote(userId, noteId, { title: version.title, content: version.content });
}
