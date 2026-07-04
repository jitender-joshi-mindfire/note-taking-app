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
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  resetRateLimits();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("Successful registration", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("alice@example.com");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it("Duplicate email rejected", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "bob@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "BOB@EXAMPLE.COM", password: "password123" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("DUPLICATE_EMAIL");
  });

  it("Invalid email format rejected", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.some((f: { field: string }) => f.field === "email")).toBe(true);
  });

  it("Weak password lists every violated rule", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "carol@example.com", password: "abc" });

    expect(res.status).toBe(400);
    const messages = res.body.error.fields.map((f: { message: string }) => f.message);
    expect(messages.some((m: string) => m.includes("8 characters"))).toBe(true);
    expect(messages.some((m: string) => m.includes("number"))).toBe(true);
  });
});

describe("POST /api/auth/login", () => {
  it("Successful login issues tokens", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "dave@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "DAVE@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it("Wrong credentials return a generic error", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "erin@example.com", password: "password123" });

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "erin@example.com", password: "wrongpass" });
    const noSuchUser = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrongpass" });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(noSuchUser.body);
  });

  it("Missing fields rejected", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "frank@example.com" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("Logout revokes the refresh token", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "gina@example.com", password: "password123" });
    const { accessToken, refreshToken } = registerRes.body;

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(logoutRes.status).toBe(204);
  });

  it("Revoked refresh token cannot be reused", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "hank@example.com", password: "password123" });
    const { accessToken, refreshToken } = registerRes.body;

    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    const refreshRes = await request(app).post("/api/auth/refresh").send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });

  it("Logout without a valid access token is rejected", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "ivy@example.com", password: "password123" });
    const { refreshToken } = registerRes.body;

    const res = await request(app).post("/api/auth/logout").send({ refreshToken });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("Refreshing rotates the token", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "jack@example.com", password: "password123" });
    const { refreshToken } = registerRes.body;

    const refreshRes = await request(app).post("/api/auth/refresh").send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.refreshToken).not.toBe(refreshToken);

    const reuseRes = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(reuseRes.status).toBe(401);
  });

  it("Reusing a rotated refresh token revokes all sessions", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "karen@example.com", password: "password123" });
    const { refreshToken } = registerRes.body;

    const rotateRes = await request(app).post("/api/auth/refresh").send({ refreshToken });
    const newRefreshToken = rotateRes.body.refreshToken;

    // Reuse the old, already-rotated token — should be rejected and revoke everything.
    await request(app).post("/api/auth/refresh").send({ refreshToken });

    // The new token, issued by the rotation above, should now also be revoked.
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: newRefreshToken });

    expect(res.status).toBe(401);
  });
});

describe("Rate limiting", () => {
  it("Excessive login attempts rejected", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrong" });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });

  it("Excessive registration attempts rejected", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: `spam${i}@example.com`, password: "password123" });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
