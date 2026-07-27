/**
 * Shared plumbing for the demo API routes: CORS (open for GET, per the demo
 * spec), JSON responses, and the per-IP rate-limit gate. Kept as pure/plain
 * functions operating on the Node request/response objects Vercel's Node.js
 * runtime provides (req.query / req.body are parsed automatically), so this
 * is zero-network and unit-testable with plain fake req/res objects.
 */
import { checkRateLimit, getClientIp } from './rate-limit.js';

/**
 * @param {import('http').ServerResponse} res
 * @param {{methods?: string}} [opts]
 */
export function applyCors(res, opts = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', opts.methods ?? 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Wrap a route handler with CORS headers, OPTIONS preflight short-circuit,
 * the per-IP rate limiter, and a catch-all 500 so a thrown error never
 * produces an unhandled-rejection / hung response.
 * @param {(req: any, res: any) => Promise<void>|void} handler
 * @param {{methods?: string}} [opts]
 */
export function withGate(handler, opts = {}) {
  return async function gated(req, res) {
    applyCors(res, opts);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      sendJson(res, 429, {
        error: 'Rate limit exceeded for this demo (per-IP, resets within a minute). Please try again shortly.',
        retryAfterMs: rl.retryAfterMs,
      });
      return;
    }
    try {
      await handler(req, res);
    } catch (err) {
      // Vercel's Node.js runtime lazily parses `req.body` and throws on
      // malformed JSON the first time a handler accesses it (documented at
      // vercel.com/docs/functions/runtimes/node-js#request-body) — that
      // throw lands here, not in the handler's own validation, so it must be
      // classified as a client error (400) rather than falling through to
      // the generic 500 below.
      if (/invalid json/i.test(err?.message ?? '')) {
        sendJson(res, 400, { error: 'Malformed JSON in request body.' });
        return;
      }
      sendJson(res, 500, { error: 'Internal error', detail: err.message });
    }
  };
}
