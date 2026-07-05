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

describe("POST /api/tags", () => {
  it("Successful tag creation with name only", async () => {
    const token = await registerAndGetToken("alice-tags@example.com");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Work" });

    expect(res.status).toBe(201);
    expect(res.body.tag.name).toBe("Work");
    expect(res.body.tag.color).toBeNull();
    expect(res.body.tag.id).toBeTruthy();
  });

  it("Successful tag creation with name and color", async () => {
    const token = await registerAndGetToken("bob-tags@example.com");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Urgent", color: "#FF0000" });

    expect(res.status).toBe(201);
    expect(res.body.tag.name).toBe("Urgent");
    expect(res.body.tag.color).toBe("#FF0000");
  });

  it("Duplicate tag name rejected case-insensitively", async () => {
    const token = await registerAndGetToken("carol-tags@example.com");

    await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Personal" });

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "PERSONAL" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_TAG_NAME");
  });

  it("Empty or over-length tag name rejected", async () => {
    const token = await registerAndGetToken("dave-tags@example.com");

    const emptyRes = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "" });
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.fields.some((f: { field: string }) => f.field === "name")).toBe(
      true,
    );

    const overLengthRes = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "x".repeat(51) });
    expect(overLengthRes.status).toBe(400);
    expect(
      overLengthRes.body.error.fields.some((f: { field: string }) => f.field === "name"),
    ).toBe(true);
  });

  it("Invalid color format rejected", async () => {
    const token = await registerAndGetToken("erin-tags@example.com");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Ideas", color: "not-a-color" });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.some((f: { field: string }) => f.field === "color")).toBe(true);
  });
});

describe("GET /api/tags", () => {
  it("Listing returns only the caller's own tags", async () => {
    const tokenA = await registerAndGetToken("frank-tags@example.com");
    const tokenB = await registerAndGetToken("grace-tags@example.com");

    await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "A's tag" });
    await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "B's tag" });

    const res = await request(app).get("/api/tags").set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe("A's tag");
  });

  it("Note count reflects only non-deleted notes currently tagged", async () => {
    const token = await registerAndGetToken("henry-tags@example.com");

    const tagRes = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Shared" });
    const tagId = tagRes.body.tag.id;

    const note1 = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Note 1", content: "x" });
    const note2 = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Note 2", content: "x" });

    await request(app)
      .patch(`/api/notes/${note1.body.note.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tagIds: [tagId] });
    await request(app)
      .patch(`/api/notes/${note2.body.note.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tagIds: [tagId] });

    await request(app)
      .delete(`/api/notes/${note1.body.note.id}`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app).get("/api/tags").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const shared = res.body.items.find((t: { id: string }) => t.id === tagId);
    expect(shared.noteCount).toBe(1);
  });

  it("Newly created tag appears with a note count of zero", async () => {
    const token = await registerAndGetToken("ivy-tags@example.com");

    await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Fresh" });

    const res = await request(app).get("/api/tags").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const fresh = res.body.items.find((t: { name: string }) => t.name === "Fresh");
    expect(fresh.noteCount).toBe(0);
  });
});

describe("PATCH /api/tags/:id", () => {
  it("Partial update applies only the provided fields", async () => {
    const token = await registerAndGetToken("jack-tags@example.com");

    const created = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Original", color: "#123456" });

    const res = await request(app)
      .patch(`/api/tags/${created.body.tag.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.tag.name).toBe("Renamed");
    expect(res.body.tag.color).toBe("#123456");
  });

  it("Update with no fields rejected", async () => {
    const token = await registerAndGetToken("karen-tags@example.com");

    const created = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Tag" });

    const res = await request(app)
      .patch(`/api/tags/${created.body.tag.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("Renaming to a name colliding with another of the caller's tags is rejected", async () => {
    const token = await registerAndGetToken("leo-tags@example.com");

    await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Existing" });
    const second = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Other" });

    const res = await request(app)
      .patch(`/api/tags/${second.body.tag.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "EXISTING" });

    expect(res.status).toBe(409);
  });

  it("Updating a tag not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("mia-tags@example.com");
    const tokenB = await registerAndGetToken("nina-tags@example.com");

    const created = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "A's tag" });

    const res = await request(app)
      .patch(`/api/tags/${created.body.tag.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Hacked" });

    expect(res.status).toBe(404);

    const stillOriginal = await prisma.tag.findUniqueOrThrow({
      where: { id: created.body.tag.id },
    });
    expect(stillOriginal.name).toBe("A's tag");
  });
});

describe("DELETE /api/tags/:id", () => {
  it("Deleting a tag removes it from all notes without deleting the notes", async () => {
    const token = await registerAndGetToken("oscar-tags@example.com");

    const tagRes = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Removable" });
    const tagId = tagRes.body.tag.id;

    const noteRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Tagged note", content: "x" });
    const noteId = noteRes.body.note.id;

    await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tagIds: [tagId] });

    const deleteRes = await request(app)
      .delete(`/api/tags/${tagId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const noteAfter = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(noteAfter.status).toBe(200);
    expect(noteAfter.body.note.tags.some((t: { id: string }) => t.id === tagId)).toBe(false);
    expect(noteAfter.body.note.title).toBe("Tagged note");
  });

  it("Deleting a tag not owned by the caller returns not found", async () => {
    const tokenA = await registerAndGetToken("penny-tags@example.com");
    const tokenB = await registerAndGetToken("quinn-tags@example.com");

    const created = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "A's tag" });

    const res = await request(app)
      .delete(`/api/tags/${created.body.tag.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);

    const stillExists = await prisma.tag.findUniqueOrThrow({
      where: { id: created.body.tag.id },
    });
    expect(stillExists).toBeTruthy();
  });
});
