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
  await prisma.shareLink.deleteMany();
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

async function createNote(token: string, title = "Shared Note", content = "Some content") {
  const res = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, content });
  return res.body.note.id as string;
}

describe("POST /api/notes/:id/share", () => {
  it("Successful link generation for a note with no existing link", async () => {
    const token = await registerAndGetToken("alice-share@example.com");
    const noteId = await createNote(token);

    const res = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.url).toBeTruthy();
    expect(res.body.expiresAt).toBeTruthy();
  });

  it("Generating a link for a note not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("bob-share@example.com");
    const tokenB = await registerAndGetToken("carol-share@example.com");
    const noteId = await createNote(tokenA);

    const res = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ expiresInDays: 7 });

    expect(res.status).toBe(404);
  });

  it("expiresInDays out of bounds rejected", async () => {
    const token = await registerAndGetToken("dave-share@example.com");
    const noteId = await createNote(token);

    const tooLow = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 0 });
    expect(tooLow.status).toBe(400);

    const tooHigh = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 366 });
    expect(tooHigh.status).toBe(400);
  });

  it("Generating a new link replaces the existing one", async () => {
    const token = await registerAndGetToken("erin-share@example.com");
    const noteId = await createNote(token);

    const first = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });
    const oldToken = first.body.token as string;

    await request(app).get(`/api/share/${oldToken}`);
    await request(app).get(`/api/share/${oldToken}`);

    const second = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });
    const newToken = second.body.token as string;

    expect(newToken).not.toBe(oldToken);

    const noteRes = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(noteRes.body.note.shareLink.token).toBe(newToken);
    expect(noteRes.body.note.shareLink.viewCount).toBe(0);

    const oldTokenRes = await request(app).get(`/api/share/${oldToken}`);
    expect(oldTokenRes.status).toBe(404);
  });
});

describe("DELETE /api/notes/:id/share", () => {
  it("Owner revokes their active share link", async () => {
    const token = await registerAndGetToken("frank-share@example.com");
    const noteId = await createNote(token);
    await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });

    const res = await request(app)
      .delete(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it("Revoking when no active link exists returns not found", async () => {
    const token = await registerAndGetToken("grace-share@example.com");
    const noteId = await createNote(token);

    const res = await request(app)
      .delete(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("Revoking a link for a note not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("henry-share@example.com");
    const tokenB = await registerAndGetToken("ivy-share@example.com");
    const noteId = await createNote(tokenA);
    await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ expiresInDays: 7 });

    const res = await request(app)
      .delete(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/share/:token", () => {
  it("Valid link returns the note read-only without authentication", async () => {
    const token = await registerAndGetToken("jack-share@example.com");
    const noteId = await createNote(token, "Public Note", "Public content");
    const shareRes = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });

    const res = await request(app).get(`/api/share/${shareRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Public Note");
    expect(res.body.content).toBe("Public content");
    expect(res.body.updatedAt).toBeTruthy();
  });

  it("Unknown token returns not found", async () => {
    const res = await request(app).get("/api/share/this-token-does-not-exist");

    expect(res.status).toBe(404);
  });

  it("Expired token returns gone", async () => {
    const token = await registerAndGetToken("karen-share@example.com");
    const noteId = await createNote(token);
    const shareRes = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });

    await prisma.shareLink.update({
      where: { token: shareRes.body.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).get(`/api/share/${shareRes.body.token}`);

    expect(res.status).toBe(410);
  });

  it("Revoked token returns not found", async () => {
    const token = await registerAndGetToken("leo-share@example.com");
    const noteId = await createNote(token);
    const shareRes = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });

    await request(app)
      .delete(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app).get(`/api/share/${shareRes.body.token}`);

    expect(res.status).toBe(404);
  });
});

describe("Share link view count", () => {
  it("Each successful public view atomically increments the view count", async () => {
    const token = await registerAndGetToken("mia-share@example.com");
    const noteId = await createNote(token);
    const shareRes = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });

    await request(app).get(`/api/share/${shareRes.body.token}`);
    await request(app).get(`/api/share/${shareRes.body.token}`);
    await request(app).get(`/api/share/${shareRes.body.token}`);

    const noteRes = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(noteRes.body.note.shareLink.viewCount).toBe(3);
  });

  it("The owner sees the current view count via the note's response", async () => {
    const token = await registerAndGetToken("nina-share@example.com");
    const noteId = await createNote(token);
    const shareRes = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });

    await request(app).get(`/api/share/${shareRes.body.token}`);
    await request(app).get(`/api/share/${shareRes.body.token}`);

    const noteRes = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(noteRes.body.note.shareLink.viewCount).toBe(2);
  });

  it("An unsuccessful view attempt does not increment the view count", async () => {
    const token = await registerAndGetToken("oscar-share@example.com");
    const noteId = await createNote(token);
    const shareRes = await request(app)
      .post(`/api/notes/${noteId}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });

    await prisma.shareLink.update({
      where: { token: shareRes.body.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).get(`/api/share/${shareRes.body.token}`);
    expect(res.status).toBe(410);

    const link = await prisma.shareLink.findUniqueOrThrow({
      where: { token: shareRes.body.token },
    });
    expect(link.viewCount).toBe(0);
  });
});
