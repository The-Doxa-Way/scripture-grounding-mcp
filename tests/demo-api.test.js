/**
 * Tests for the demo/ Vercel API route glue (demo/api/*.js) and the shared
 * CORS/rate-limit/JSON helpers (demo/api/_lib/http.js). These exercise the
 * plain (req, res) handlers directly with fake request/response objects —
 * no Vercel runtime, no network. `encourage.js` builds its Gloo client from
 * process.env at import time; since this test suite never sets
 * GLOO_CLIENT_ID/GLOO_CLIENT_SECRET (and demo/ never calls src/env.js's
 * local-dev credential loader), it always exercises the deterministic stub
 * path — zero network, matching this repo's existing test-hermeticity
 * convention.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCors, sendJson, withGate } from '../demo/api/_lib/http.js';
import { _resetForTests } from '../demo/api/_lib/rate-limit.js';
import passageHandler from '../demo/api/passage.js';
import verifyHandler from '../demo/api/verify.js';
import encourageHandler from '../demo/api/encourage.js';
import openapiHandler from '../demo/api/openapi.js';

function makeReq({ method = 'GET', query = {}, body, ip = '127.0.0.1' } = {}) {
  return { method, query, body, headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: ip } };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    ended: false,
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(b) {
      this.ended = true;
      this.body = b;
    },
  };
}

function json(res) {
  return res.body ? JSON.parse(res.body) : undefined;
}

// --- _lib/http.js -----------------------------------------------------------

test('applyCors sets open-CORS headers', () => {
  const res = makeRes();
  applyCors(res);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  assert.match(res.headers['Access-Control-Allow-Methods'], /GET/);
});

test('sendJson sets status, content-type, and serializes the body', () => {
  const res = makeRes();
  sendJson(res, 201, { a: 1 });
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(res.body), { a: 1 });
});

test('withGate short-circuits OPTIONS with 204', async () => {
  _resetForTests();
  const gated = withGate(async () => assert.fail('handler should not run for OPTIONS'));
  const res = makeRes();
  await gated(makeReq({ method: 'OPTIONS', ip: '10.0.0.1' }), res);
  assert.equal(res.statusCode, 204);
});

test('withGate returns 429 once the per-IP rate limit is exceeded', async () => {
  _resetForTests();
  const gated = withGate(async (req, res) => sendJson(res, 200, { ok: true }));
  const ip = '10.0.0.2';
  let last;
  for (let i = 0; i < 31; i++) {
    last = makeRes();
    await gated(makeReq({ ip }), last);
  }
  assert.equal(last.statusCode, 429);
  assert.match(json(last).error, /rate limit/i);
});

test('withGate turns a thrown handler error into a 500 instead of crashing', async () => {
  _resetForTests();
  const gated = withGate(async () => {
    throw new Error('boom');
  });
  const res = makeRes();
  await gated(makeReq({ ip: '10.0.0.3' }), res);
  assert.equal(res.statusCode, 500);
  assert.match(json(res).error, /internal error/i);
});

// --- passage.js --------------------------------------------------------------

test('GET /api/passage returns fixture text for a known reference', async () => {
  _resetForTests();
  const res = makeRes();
  await passageHandler(makeReq({ query: { reference: 'John 3:16-17' }, ip: '20.0.0.1' }), res);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.reference, 'John 3:16-17');
  assert.equal(body.source, 'fixture');
  assert.match(body.text, /For God so loved the world/);
});

test('GET /api/passage 400s on a missing reference', async () => {
  _resetForTests();
  const res = makeRes();
  await passageHandler(makeReq({ query: {}, ip: '20.0.0.2' }), res);
  assert.equal(res.statusCode, 400);
});

test('GET /api/passage 404s with the available-references list for an unknown reference', async () => {
  _resetForTests();
  const res = makeRes();
  await passageHandler(makeReq({ query: { reference: '2 Hezekiah 3:1' }, ip: '20.0.0.3' }), res);
  assert.equal(res.statusCode, 404);
  const body = json(res);
  assert.ok(Array.isArray(body.availableReferences) && body.availableReferences.length > 0);
});

test('POST /api/passage also works (body.reference)', async () => {
  _resetForTests();
  const res = makeRes();
  await passageHandler(makeReq({ method: 'POST', body: { reference: 'Psalm 23:1-6' }, ip: '20.0.0.4' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(json(res).reference, 'Psalm 23:1-6');
});

test('DELETE /api/passage is 405', async () => {
  _resetForTests();
  const res = makeRes();
  await passageHandler(makeReq({ method: 'DELETE', ip: '20.0.0.5' }), res);
  assert.equal(res.statusCode, 405);
});

// --- verify.js ---------------------------------------------------------------

test('POST /api/verify 400s when quote or reference is missing', async () => {
  _resetForTests();
  const res = makeRes();
  await verifyHandler(makeReq({ method: 'POST', body: { quote: 'x' }, ip: '30.0.0.1' }), res);
  assert.equal(res.statusCode, 400);
});

test('POST /api/verify returns the full verdict object for an exact quote', async () => {
  _resetForTests();
  const res = makeRes();
  const quote =
    'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life. For God did not send His Son into the world to condemn the world, but to save the world through Him.';
  await verifyHandler(makeReq({ method: 'POST', body: { quote, reference: 'John 3:16-17' }, ip: '30.0.0.2' }), res);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.verdict, 'exact');
  assert.ok(body.diffSummary);
});

test('GET /api/verify is 405', async () => {
  _resetForTests();
  const res = makeRes();
  await verifyHandler(makeReq({ method: 'GET', ip: '30.0.0.3' }), res);
  assert.equal(res.statusCode, 405);
});

// --- encourage.js --------------------------------------------------------------

test('POST /api/encourage 400s on a missing message', async () => {
  _resetForTests();
  const res = makeRes();
  await encourageHandler(makeReq({ method: 'POST', body: {}, ip: '40.0.0.1' }), res);
  assert.equal(res.statusCode, 400);
});

test('POST /api/encourage degrades gracefully to stub mode with no Gloo credentials configured', async () => {
  _resetForTests();
  assert.equal(process.env.GLOO_CLIENT_ID, undefined, 'test must run keyless to prove the fallback path');
  const res = makeRes();
  await encourageHandler(makeReq({ method: 'POST', body: { message: "I'm anxious about my future" }, ip: '40.0.0.2' }), res);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.source, 'stub');
  assert.match(body.reply, /stub mode/);
  assert.equal(body.groundedOn.reference, 'Philippians 4:6-7');
});

test('GET /api/encourage is 405', async () => {
  _resetForTests();
  const res = makeRes();
  await encourageHandler(makeReq({ method: 'GET', ip: '40.0.0.3' }), res);
  assert.equal(res.statusCode, 405);
});

// --- openapi.js ----------------------------------------------------------------

test('GET /api/openapi.yaml serves the OpenAPI spec as YAML', async () => {
  const res = makeRes();
  await openapiHandler(makeReq({ ip: '50.0.0.1' }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /yaml/);
  assert.match(res.body, /openapi: 3\.1\.0/);
  assert.match(res.body, /\/api\/passage/);
});

test('POST /api/openapi.yaml is 405', async () => {
  const res = makeRes();
  await openapiHandler(makeReq({ method: 'POST', ip: '50.0.0.2' }), res);
  assert.equal(res.statusCode, 405);
});
