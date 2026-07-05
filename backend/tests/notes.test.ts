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

describe("POST /api/notes", () => {
  it("Successful note creation", async () => {
    const token = await registerAndGetToken("alice-notes@example.com");

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "My First Note", content: "Hello world" });

    expect(res.status).toBe(201);
    expect(res.body.note.title).toBe("My First Note");
    expect(res.body.note.content).toBe("Hello world");
    expect(res.body.note.id).toBeTruthy();
  });

  it("Empty title rejected", async () => {
    const token = await registerAndGetToken("bob-notes@example.com");

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "", content: "x" });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.some((f: { field: string }) => f.field === "title")).toBe(true);
  });

  it("Creation produces the first version snapshot", async () => {
    const token = await registerAndGetToken("carol-notes@example.com");

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Versioned Note", content: "v1" });

    const versions = await prisma.noteVersion.findMany({
      where: { noteId: res.body.note.id },
    });

    expect(versions).toHaveLength(1);
    expect(versions[0]?.title).toBe("Versioned Note");
    expect(versions[0]?.content).toBe("v1");
  });
});

describe("GET /api/notes", () => {
  it("List returns only the caller's own non-deleted notes", async () => {
    const tokenA = await registerAndGetToken("dave-notes@example.com");
    const tokenB = await registerAndGetToken("erin-notes@example.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "A's note", content: "a" });
    const bNote = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "B's note", content: "b" });
    const deletedNote = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "A's deleted note", content: "a-deleted" });
    await request(app)
      .delete(`/api/notes/${deletedNote.body.note.id}`)
      .set("Authorization", `Bearer ${tokenA}`);

    const res = await request(app).get("/api/notes").set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("A's note");
    expect(res.body.items.some((n: { id: string }) => n.id === bNote.body.note.id)).toBe(false);
  });

  it("Custom page size is honored up to the maximum", async () => {
    const token = await registerAndGetToken("ruth-notes@example.com");

    for (const title of ["N1", "N2", "N3"]) {
      await request(app)
        .post("/api/notes")
        .set("Authorization", `Bearer ${token}`)
        .send({ title, content: "x" });
    }

    const res = await request(app)
      .get("/api/notes?pageSize=2")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });

  it("Page size above the maximum is capped", async () => {
    const token = await registerAndGetToken("sam-notes2@example.com");

    const res = await request(app)
      .get("/api/notes?pageSize=500")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });

  it("Sorting by title ascending", async () => {
    const token = await registerAndGetToken("tina-notes@example.com");

    for (const title of ["Zebra", "Apple", "Mango"]) {
      await request(app)
        .post("/api/notes")
        .set("Authorization", `Bearer ${token}`)
        .send({ title, content: "x" });
    }

    const res = await request(app)
      .get("/api/notes?sortBy=title&sortDir=asc")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((n: { title: string }) => n.title)).toEqual([
      "Apple",
      "Mango",
      "Zebra",
    ]);
  });

  it("Unrecognized sortBy value rejected", async () => {
    const token = await registerAndGetToken("uma-notes2@example.com");

    const res = await request(app)
      .get("/api/notes?sortBy=nonsense")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it("Page beyond the last page returns an empty list", async () => {
    const token = await registerAndGetToken("victor-notes2@example.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Only note", content: "x" });

    const res = await request(app)
      .get("/api/notes?page=999")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(999);
  });
});

describe("GET /api/notes/:id", () => {
  it("Reading a note not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("frank-notes@example.com");
    const tokenB = await registerAndGetToken("grace-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "A's note", content: "a" });

    const res = await request(app)
      .get(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it("Reading a soft-deleted note returns not found", async () => {
    const token = await registerAndGetToken("henry-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Doomed note", content: "x" });
    await request(app)
      .delete(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/notes/:id", () => {
  it("Partial update applies only the provided fields", async () => {
    const token = await registerAndGetToken("ivy-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Original Title", content: "Original content" });

    const res = await request(app)
      .patch(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New Title" });

    expect(res.status).toBe(200);
    expect(res.body.note.title).toBe("New Title");
    expect(res.body.note.content).toBe("Original content");
  });

  it("Update with no fields rejected", async () => {
    const token = await registerAndGetToken("jack-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Title", content: "content" });

    const res = await request(app)
      .patch(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("Update creates a version snapshot of the prior state", async () => {
    const token = await registerAndGetToken("karen-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Before", content: "before-content" });

    await request(app)
      .patch(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "After" });

    const versions = await prisma.noteVersion.findMany({
      where: { noteId: created.body.note.id },
      orderBy: { createdAt: "asc" },
    });

    expect(versions).toHaveLength(2);
    expect(versions[0]?.title).toBe("Before");
    expect(versions[1]?.title).toBe("Before"); // snapshot taken BEFORE applying "After"
  });

  it("Updating a note not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("leo-notes@example.com");
    const tokenB = await registerAndGetToken("mia-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "A's note", content: "a" });

    const res = await request(app)
      .patch(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Hacked" });

    expect(res.status).toBe(404);

    const stillOriginal = await prisma.note.findUniqueOrThrow({
      where: { id: created.body.note.id },
    });
    expect(stillOriginal.title).toBe("A's note");
  });
});

describe("DELETE /api/notes/:id", () => {
  it("Delete sets deletedAt instead of removing the row", async () => {
    const token = await registerAndGetToken("nina-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "To delete", content: "x" });

    const res = await request(app)
      .delete(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);

    const row = await prisma.note.findUniqueOrThrow({ where: { id: created.body.note.id } });
    expect(row.deletedAt).not.toBeNull();
  });

  it("Soft-deleted notes disappear from list and detail endpoints", async () => {
    const token = await registerAndGetToken("oscar-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "To delete", content: "x" });
    await request(app)
      .delete(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`);

    const listRes = await request(app).get("/api/notes").set("Authorization", `Bearer ${token}`);
    expect(listRes.body.items).toHaveLength(0);

    const getRes = await request(app)
      .get(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it("Deleting a note not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("penny-notes@example.com");
    const tokenB = await registerAndGetToken("quinn-notes@example.com");

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "A's note", content: "a" });

    const res = await request(app)
      .delete(`/api/notes/${created.body.note.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);

    const stillExists = await prisma.note.findUniqueOrThrow({
      where: { id: created.body.note.id },
    });
    expect(stillExists.deletedAt).toBeNull();
  });
});
