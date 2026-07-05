import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter,
  resetPasswordLimiter,
} from "../src/middleware/rateLimit.js";

const LOOPBACK_KEYS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

function resetRateLimits() {
  for (const key of LOOPBACK_KEYS) {
    loginLimiter.resetKey(key);
    registerLimiter.resetKey(key);
    forgotPasswordLimiter.resetKey(key);
    resetPasswordLimiter.resetKey(key);
  }
}

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  resetRateLimits();
});

// The OTP is only ever exposed via console.log (never in the API response, per
// FRS 3.4.2 — no real email is sent). Capture it the same way a developer would
// in this dev-only flow.
async function requestOtpAndCapture(email: string): Promise<string | null> {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  await request(app).post("/api/auth/forgot-password").send({ email });
  const otpCall = logSpy.mock.calls.find((call) => String(call[0]).includes("[OTP]"));
  logSpy.mockRestore();
  const match = otpCall ? /(\d{6})$/.exec(String(otpCall[0])) : null;
  return match ? match[1] : null;
}

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

  it("Logout with another user's refresh token is rejected", async () => {
    const userA = await request(app)
      .post("/api/auth/register")
      .send({ email: "leo@example.com", password: "password123" });
    const userB = await request(app)
      .post("/api/auth/register")
      .send({ email: "mia@example.com", password: "password123" });

    // User A's access token, but User B's refresh token — must not be allowed to
    // revoke a session that doesn't belong to the authenticated caller.
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${userA.body.accessToken}`)
      .send({ refreshToken: userB.body.refreshToken });

    expect(res.status).toBe(401);

    // User B's refresh token must still work, proving it was never revoked by A's attempt.
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: userB.body.refreshToken });
    expect(refreshRes.status).toBe(200);
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

  it("Reusing a logout-revoked token does not revoke other sessions", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "nina@example.com", password: "password123" });
    const { accessToken, refreshToken: sessionAToken } = registerRes.body;

    // A second, independent session for the same user (e.g. a different device).
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "nina@example.com", password: "password123" });
    const sessionBToken = loginRes.body.refreshToken;

    // Log out session A normally.
    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken: sessionAToken });

    // Replay session A's now-dead token (e.g. a client retrying a logout call).
    const replayRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: sessionAToken });
    expect(replayRes.status).toBe(401);

    // Session B must be unaffected — logout-revoked-token replay must not mass-revoke.
    const sessionBRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: sessionBToken });
    expect(sessionBRes.status).toBe(200);
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

describe("POST /api/auth/forgot-password", () => {
  it("Request reset for an existing account", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "olga@example.com", password: "password123" });

    const otp = await requestOtpAndCapture("olga@example.com");

    expect(otp).toMatch(/^\d{6}$/);
  });

  it("Request reset for a non-existent account returns an identical response", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "pete@example.com", password: "password123" });

    const existingRes = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "pete@example.com" });
    const missingRes = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody-forgot@example.com" });

    expect(existingRes.status).toBe(200);
    expect(missingRes.status).toBe(200);
    expect(existingRes.body).toEqual(missingRes.body);

    const otpForMissing = await requestOtpAndCapture("nobody-forgot@example.com");
    expect(otpForMissing).toBeNull();
  });

  it("New OTP request invalidates the previous one", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "quinn@example.com", password: "password123" });

    const firstOtp = await requestOtpAndCapture("quinn@example.com");
    const secondOtp = await requestOtpAndCapture("quinn@example.com");

    const firstAttempt = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "quinn@example.com", otp: firstOtp, newPassword: "shouldfail123" });
    expect(firstAttempt.status).toBe(401);

    const secondAttempt = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "quinn@example.com", otp: secondOtp, newPassword: "shouldwork123" });
    expect(secondAttempt.status).toBe(200);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("Successful password reset", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "rosa@example.com", password: "password123" });
    const otp = await requestOtpAndCapture("rosa@example.com");

    const resetRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "rosa@example.com", otp, newPassword: "brandnewpass456" });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body).not.toHaveProperty("accessToken");
    expect(resetRes.body).not.toHaveProperty("refreshToken");

    const oldPasswordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "rosa@example.com", password: "password123" });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "rosa@example.com", password: "brandnewpass456" });
    expect(newPasswordLogin.status).toBe(200);
  });

  it("Expired OTP rejected", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "sam@example.com", password: "password123" });
    const otp = await requestOtpAndCapture("sam@example.com");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "sam@example.com" } });
    await prisma.passwordResetOtp.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "sam@example.com", otp, newPassword: "newpassword123" });

    expect(res.status).toBe(410);
  });

  it("Wrong or already-used OTP rejected", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "tara@example.com", password: "password123" });
    const otp = await requestOtpAndCapture("tara@example.com");

    const wrongOtpRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "tara@example.com", otp: "000000", newPassword: "newpassword123" });
    expect(wrongOtpRes.status).toBe(401);

    const usedOnceRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "tara@example.com", otp, newPassword: "newpassword123" });
    expect(usedOnceRes.status).toBe(200);

    const reusedRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "tara@example.com", otp, newPassword: "anotherpassword456" });
    expect(reusedRes.status).toBe(401);
  });

  it("Weak new password rejected", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "uma@example.com", password: "password123" });
    const otp = await requestOtpAndCapture("uma@example.com");

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "uma@example.com", otp, newPassword: "abc" });

    expect(res.status).toBe(400);
    const messages = res.body.error.fields.map((f: { message: string }) => f.message);
    expect(messages.some((m: string) => m.includes("8 characters"))).toBe(true);
    expect(messages.some((m: string) => m.includes("number"))).toBe(true);
  });
});

describe("Password reset rate limiting", () => {
  it("Excessive forgot-password requests rejected", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "victor@example.com" });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });

  it("Excessive reset-password attempts rejected", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ email: "wendy@example.com", otp: "123456", newPassword: "password123" });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
