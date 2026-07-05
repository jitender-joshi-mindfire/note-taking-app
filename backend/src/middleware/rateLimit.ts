import { rateLimit } from "express-rate-limit";

// These limiters key on req.ip by default. If this app is ever deployed behind a
// reverse proxy or load balancer, Express's `app.set('trust proxy', ...)` MUST be
// configured to match that proxy's topology, or req.ip will resolve to the
// proxy's address (collapsing every client onto one shared rate-limit bucket) —
// deliberately NOT set here, since guessing an incorrect trust-proxy value would
// let clients spoof their IP via X-Forwarded-For, which is worse than the
// collapsed-bucket problem it would appear to fix. Whoever configures the actual
// deployment infrastructure must set this deliberately for that environment.
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

export const forgotPasswordLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedResponse,
});

export const resetPasswordLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedResponse,
});
