import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { loginLimiter, registerLimiter } from "../src/middleware/rateLimit.js";

const LOOPBACK_KEYS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

function resetRateLimits() {
  for (const key of LOOPBACK_KEYS) {
    loginLimiter.resetKey(key);
    registerLimiter.resetKey(key);
  }
}

beforeEach(async () => {
  await prisma.noteVersion.deleteMany();
  await prisma.note.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  resetRateLimits();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function registerAndGetToken(email: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123" });
  return res.body.accessToken;
}

async function createNote(token: string, title = "Note", content = "content") {
  const res = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, content });
  return res.body.note.id as string;
}

describe("GET /api/notes/:id/versions", () => {
  it("Listing returns retained versions newest first", async () => {
    const token = await registerAndGetToken("alice-versions@example.com");
    // Creation snapshots "Title v1" as version #1.
    const noteId = await createNote(token, "Title v1", "content v1");

    // Each update snapshots the note's PRE-update state before applying the change,
    // so this creates version #2 capturing "Title v1" (the state just before it became v2).
    await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Title v2" });
    // This creates version #3 capturing "Title v2" (the state just before it became v3).
    await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Title v3" });

    const res = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items.map((v: { title: string }) => v.title)).toEqual([
      "Title v2",
      "Title v1",
      "Title v1",
    ]);
  });

  it("Listing versions for a note not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("bob-versions@example.com");
    const tokenB = await registerAndGetToken("carol-versions@example.com");
    const noteId = await createNote(tokenA, "A's note", "a");

    const res = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it("Listing versions for a soft-deleted note returns not found", async () => {
    const token = await registerAndGetToken("dave-versions@example.com");
    const noteId = await createNote(token, "Doomed note", "x");

    await request(app)
      .delete(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/notes/:id/versions/:versionId", () => {
  it("Viewing a retained version returns its full content", async () => {
    const token = await registerAndGetToken("erin-versions@example.com");
    const noteId = await createNote(token, "Original Title", "Original content");

    await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated Title" });

    const listRes = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${token}`);
    const versionId = listRes.body.items[0].id as string;

    const res = await request(app)
      .get(`/api/notes/${noteId}/versions/${versionId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.version.title).toBe("Original Title");
    expect(res.body.version.content).toBe("Original content");
    expect(res.body.version.createdAt).toBeTruthy();
  });

  it("Viewing a version for a note not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("frank-versions@example.com");
    const tokenB = await registerAndGetToken("grace-versions@example.com");
    const noteId = await createNote(tokenA, "A's note", "a");

    await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "A's note v2" });

    const listRes = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${tokenA}`);
    const versionId = listRes.body.items[0].id as string;

    const res = await request(app)
      .get(`/api/notes/${noteId}/versions/${versionId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it("Viewing a version id that belongs to a different note returns not found", async () => {
    const token = await registerAndGetToken("henry-versions@example.com");
    const noteA = await createNote(token, "Note A", "a-content");
    const noteB = await createNote(token, "Note B", "b-content");

    await request(app)
      .patch(`/api/notes/${noteA}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Note A v2" });
    await request(app)
      .patch(`/api/notes/${noteB}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Note B v2" });

    const noteBVersions = await request(app)
      .get(`/api/notes/${noteB}/versions`)
      .set("Authorization", `Bearer ${token}`);
    const noteBVersionId = noteBVersions.body.items[0].id as string;

    const res = await request(app)
      .get(`/api/notes/${noteA}/versions/${noteBVersionId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/notes/:id/versions/:versionId/restore", () => {
  it("Restoring a version applies its content as the new current state", async () => {
    const token = await registerAndGetToken("ivy-versions@example.com");
    const noteId = await createNote(token, "Original Title", "Original content");

    await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated Title", content: "Updated content" });

    const listRes = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${token}`);
    const originalVersionId = listRes.body.items[0].id as string;

    const restoreRes = await request(app)
      .post(`/api/notes/${noteId}/versions/${originalVersionId}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(restoreRes.status).toBe(201);
    expect(restoreRes.body.note.title).toBe("Original Title");
    expect(restoreRes.body.note.content).toBe("Original content");

    const getRes = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.body.note.title).toBe("Original Title");
    expect(getRes.body.note.content).toBe("Original content");
  });

  it("Restoring creates a new version without altering existing history", async () => {
    const token = await registerAndGetToken("jack-versions@example.com");
    const noteId = await createNote(token, "Original Title", "Original content");

    await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated Title", content: "Updated content" });

    const beforeRes = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${token}`);
    const beforeVersions = beforeRes.body.items as { id: string; title: string }[];
    const originalVersionId = beforeVersions[0].id;

    await request(app)
      .post(`/api/notes/${noteId}/versions/${originalVersionId}/restore`)
      .set("Authorization", `Bearer ${token}`);

    const afterRes = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${token}`);
    const afterVersions = afterRes.body.items as { id: string; title: string }[];

    expect(afterVersions).toHaveLength(beforeVersions.length + 1);
    for (const version of beforeVersions) {
      const match = afterVersions.find((v) => v.id === version.id);
      expect(match).toBeTruthy();
      expect(match?.title).toBe(version.title);
    }
  });

  it("Restoring a note not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("karen-versions@example.com");
    const tokenB = await registerAndGetToken("leo-versions@example.com");
    const noteId = await createNote(tokenA, "A's note", "a-content");

    await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "A's note v2" });

    const listRes = await request(app)
      .get(`/api/notes/${noteId}/versions`)
      .set("Authorization", `Bearer ${tokenA}`);
    const versionId = listRes.body.items[0].id as string;

    const res = await request(app)
      .post(`/api/notes/${noteId}/versions/${versionId}/restore`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);

    const stillOwned = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(stillOwned.body.note.title).toBe("A's note v2");
    expect(stillOwned.body.note.content).toBe("a-content");
  });

  it("Restoring a version id that belongs to a different note returns not found", async () => {
    const token = await registerAndGetToken("mia-versions@example.com");
    const noteA = await createNote(token, "Note A", "a-content");
    const noteB = await createNote(token, "Note B", "b-content");

    await request(app)
      .patch(`/api/notes/${noteA}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Note A v2", content: "a-content-v2" });
    await request(app)
      .patch(`/api/notes/${noteB}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Note B v2" });

    const noteBVersions = await request(app)
      .get(`/api/notes/${noteB}/versions`)
      .set("Authorization", `Bearer ${token}`);
    const noteBVersionId = noteBVersions.body.items[0].id as string;

    const res = await request(app)
      .post(`/api/notes/${noteA}/versions/${noteBVersionId}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);

    const stillNoteA = await request(app)
      .get(`/api/notes/${noteA}`)
      .set("Authorization", `Bearer ${token}`);
    expect(stillNoteA.body.note.title).toBe("Note A v2");
    expect(stillNoteA.body.note.content).toBe("a-content-v2");
  });
});
