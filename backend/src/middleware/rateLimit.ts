import { rateLimit } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;

const rateLimitedResponse = {
  error: { code: "TOO_MANY_REQUESTS", message: "Too many requests, try again later" },
};

export const loginLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedResponse,
});

export const registerLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedResponse,
});
