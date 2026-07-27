/**
 * Naive per-IP in-memory rate limiter for the public demo API.
 *
 * This is intentionally crude, and named as such: state lives only in the
 * warm serverless instance's memory (resets on cold start, is NOT shared
 * across concurrent Vercel instances/regions). That's an accepted tradeoff
 * for a Kaggle-judge demo — this is explicitly "simple per-IP in-memory
 * throttle (this is a demo)", not a production rate limiter. A real
 * deployment would back this with a shared store (e.g. Redis/Upstash).
 *
 * `now` is injectable so this stays a pure, deterministic, zero-network unit
 * testable without waiting on real wall-clock time.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

/** @type {Map<string, {count: number, resetAt: number}>} */
let buckets = new Map();

/**
 * @param {string} ip
 * @param {{now?: () => number}} [opts]
 * @returns {{allowed: boolean, retryAfterMs?: number}}
 */
export function checkRateLimit(ip, opts = {}) {
  const now = (opts.now ?? Date.now)();
  const key = ip || 'unknown';
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }
  return { allowed: true };
}

/** Extract a best-effort client IP from a Vercel Node request. */
export function getClientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** Test-only: clear all bucket state between test cases. */
export function _resetForTests() {
  buckets = new Map();
}

export const _config = { WINDOW_MS, MAX_REQUESTS_PER_WINDOW };
