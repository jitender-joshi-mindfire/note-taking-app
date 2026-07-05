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

describe("GET /api/search", () => {
  it("Successful search returns matching notes", async () => {
    const token = await registerAndGetToken("alice-search@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Grocery list", content: "Remember to buy xylophone strings" });

    const res = await request(app)
      .get("/api/search?q=xylophone")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].note.id).toBe(created.body.note.id);
    expect(res.body.items[0].note.title).toBe("Grocery list");
    expect(res.body.items[0].snippet).toBeTruthy();
  });

  it("Search excludes another user's notes", async () => {
    const tokenA = await registerAndGetToken("bob-search@example.com");
    const tokenB = await registerAndGetToken("carol-search@example.com");

    const bNote = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "B's secret", content: "This mentions armadillo frequently" });

    const res = await request(app)
      .get("/api/search?q=armadillo")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(
      res.body.items.some((item: { note: { id: string } }) => item.note.id === bNote.body.note.id),
    ).toBe(false);
  });

  it("Search excludes soft-deleted notes", async () => {
    const token = await registerAndGetToken("dave-search@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Temporary note", content: "Contains the word platypus" });
    await request(app)
      .delete(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .get("/api/search?q=platypus")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("Missing or empty query rejected", async () => {
    const token = await registerAndGetToken("erin-search@example.com");

    const missingRes = await request(app)
      .get("/api/search")
      .set("Authorization", `Bearer ${token}`);
    expect(missingRes.status).toBe(400);
    expect(missingRes.body.error.code).toBe("VALIDATION_ERROR");

    const emptyRes = await request(app)
      .get("/api/search?q=")
      .set("Authorization", `Bearer ${token}`);
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.code).toBe("VALIDATION_ERROR");

    const whitespaceRes = await request(app)
      .get("/api/search?q=%20%20")
      .set("Authorization", `Bearer ${token}`);
    expect(whitespaceRes.status).toBe(400);
    expect(whitespaceRes.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("Query with no matches returns an empty result", async () => {
    const token = await registerAndGetToken("frank-search@example.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ordinary note", content: "Nothing special here" });

    const res = await request(app)
      .get("/api/search?q=nonexistentqueryterm")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("Matched keywords are highlighted in the snippet", async () => {
    const token = await registerAndGetToken("grace-search@example.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Meeting notes", content: "We discussed the quarterly roadmap in detail" });

    const res = await request(app)
      .get("/api/search?q=roadmap")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].snippet).toContain("<mark>roadmap</mark>");
  });

  it("Title is not highlighted", async () => {
    const token = await registerAndGetToken("henry-search@example.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Blorptastic plan", content: "Just a regular plan with no special terms" });

    const res = await request(app)
      .get("/api/search?q=blorptastic")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].note.title).toBe("Blorptastic plan");
    expect(res.body.items[0].note.title).not.toContain("<mark>");
    expect(res.body.items[0].note.title).not.toContain("</mark>");
  });

  it("Results are ordered by relevance", async () => {
    const token = await registerAndGetToken("ivy-search@example.com");

    const lowRelevance = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Passing mention", content: "a task that is somewhat urgent" });
    const highRelevance = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Priority task", content: "urgent urgent urgent task" });

    const res = await request(app)
      .get("/api/search?q=urgent")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].note.id).toBe(highRelevance.body.note.id);
    expect(res.body.items[1].note.id).toBe(lowRelevance.body.note.id);
  });

  it("Custom page size is honored up to the maximum", async () => {
    const token = await registerAndGetToken("jack-search@example.com");

    for (const title of ["Falcon note 1", "Falcon note 2", "Falcon note 3"]) {
      await request(app)
        .post("/api/notes")
        .set("Authorization", `Bearer ${token}`)
        .send({ title, content: "This note mentions falcon migration patterns" });
    }

    const res = await request(app)
      .get("/api/search?q=falcon&pageSize=2")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.total).toBe(3);
  });

  it("Page beyond the last page returns an empty list", async () => {
    const token = await registerAndGetToken("karen-search@example.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Solo note", content: "Discussing the wombat sanctuary" });

    const res = await request(app)
      .get("/api/search?q=wombat&page=999")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(999);
  });
});
