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
import registerHandler from '../demo/api/register.js';
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

test('withGate turns a malformed-JSON body error into a clean 400, not a 500', async () => {
  // Regression: Vercel's Node.js runtime throws an "Invalid JSON" error the
  // first time a handler accesses req.body for a request whose JSON body
  // didn't parse. Before this fix, withGate's catch-all always answered 500
  // regardless of cause — a malformed request from a caller was reported as
  // an internal server error, and every route shares this same wrapper.
  _resetForTests();
  const gated = withGate(async () => {
    throw new Error('Invalid JSON');
  });
  const res = makeRes();
  await gated(makeReq({ ip: '10.0.0.4' }), res);
  assert.equal(res.statusCode, 400);
  assert.match(json(res).error, /malformed json/i);
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

test('GET /api/passage 404s with supported-format examples for an unresolvable reference', async () => {
  _resetForTests();
  const res = makeRes();
  await passageHandler(makeReq({ query: { reference: '2 Hezekiah 3:1' }, ip: '20.0.0.3' }), res);
  assert.equal(res.statusCode, 404);
  const body = json(res);
  assert.match(body.error, /could not be resolved/);
  assert.ok(Array.isArray(body.supportedFormats) && body.supportedFormats.length > 0);
});

test('GET /api/passage serves whole-Bible corpus references outside the fixture set (chapter + whole book)', async () => {
  _resetForTests();
  const res = makeRes();
  await passageHandler(makeReq({ query: { reference: 'Romans 8' }, ip: '20.0.0.31' }), res);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.source, 'bsb-corpus');
  assert.equal(body.reference, 'Romans 8');
  assert.match(body.text, /no condemnation/);

  const res2 = makeRes();
  await passageHandler(makeReq({ query: { reference: 'Romans' }, ip: '20.0.0.32' }), res2);
  assert.equal(res2.statusCode, 200);
  const book = json(res2);
  assert.equal(book.chapterCount, 16);
  assert.equal(book.segments.length, 16);
  assert.equal(book.segments[7].reference, 'Romans 8');
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

test('GET /api/passage matches an en-dash verse range against the hyphen-range fixture (2026-07-27 fix, end-to-end through the live route)', async () => {
  _resetForTests();
  const res = makeRes();
  await passageHandler(makeReq({ query: { reference: 'Psalm 46:1–3' }, ip: '20.0.0.6' }), res); // en dash
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.reference, 'Psalm 46:1-3'); // fixture's canonical (hyphen) reference string
  assert.equal(body.source, 'fixture');
  assert.ok(body.text.length > 0);
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

test('POST /api/encourage forwards groundedReply\'s disclosure field verbatim, unfiltered (stub mode)', async () => {
  _resetForTests();
  assert.equal(process.env.GLOO_CLIENT_ID, undefined, 'test must run keyless to prove the stub disclosure');
  const res = makeRes();
  await encourageHandler(makeReq({ method: 'POST', body: { message: "I'm anxious about my future" }, ip: '40.0.0.4' }), res);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(
    body.disclosure,
    'This reply is a deterministic offline stub (no AI generation). Only the quoted passage is canonical Scripture text.'
  );
});

test('GET /api/encourage is 405', async () => {
  _resetForTests();
  const res = makeRes();
  await encourageHandler(makeReq({ method: 'GET', ip: '40.0.0.3' }), res);
  assert.equal(res.statusCode, 405);
});

// --- register.js -----------------------------------------------------------

test('POST /api/register 400s on missing text', async () => {
  _resetForTests();
  const res = makeRes();
  await registerHandler(makeReq({ method: 'POST', body: {}, ip: '45.0.0.1' }), res);
  assert.equal(res.statusCode, 400);
});

test('POST /api/register returns clean for a register-compliant reply', async () => {
  _resetForTests();
  const res = makeRes();
  const text =
    'Anxiety about the future is a heavy thing to carry. Scripture speaks to it directly:\n\n' +
    '"Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus." (Philippians 4:6-7, BSB)\n\n' +
    'Consider bringing this to God in prayer, and share it with someone who knows you.';
  await registerHandler(
    makeReq({ method: 'POST', body: { text, quotedReferences: ['Philippians 4:6-7'] }, ip: '45.0.0.2' }),
    res
  );
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.verdict, 'clean');
  assert.deepEqual(body.violations, []);
});

test('POST /api/register flags first-person and reassurance-empathy violations, with correct rule ids', async () => {
  _resetForTests();
  const res = makeRes();
  const text = "I'm sorry you're feeling this way. I'd encourage you to keep going.";
  await registerHandler(makeReq({ method: 'POST', body: { text }, ip: '45.0.0.3' }), res);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.verdict, 'violations');
  assert.ok(body.violations.some((v) => v.rule === 'reassurance-empathy'));
  assert.ok(body.violations.some((v) => v.rule === 'first-person'));
});

test('POST /api/register exempts first-person pronouns inside a quoted, resolved reference (e.g. Psalm 23)', async () => {
  _resetForTests();
  const res = makeRes();
  const text =
    'Scripture speaks to your worth directly:\n\n' +
    '"A Psalm of David. The LORD is my shepherd; I shall not want. He makes me lie down in green pastures; He leads me beside quiet waters. He restores my soul; He guides me in the paths of righteousness for the sake of His name. Even though I walk through the valley of the shadow of death, I will fear no evil, for You are with me; Your rod and Your staff, they comfort me. You prepare a table before me in the presence of my enemies. You anoint my head with oil; my cup overflows. Surely goodness and mercy will follow me all the days of my life, and I will dwell in the house of the LORD forever." (Psalm 23:1-6, BSB)\n\n' +
    'Bring this passage to God in prayer.';
  await registerHandler(
    makeReq({ method: 'POST', body: { text, quotedReferences: ['Psalm 23:1-6'] }, ip: '45.0.0.4' }),
    res
  );
  assert.equal(res.statusCode, 200);
  assert.equal(json(res).verdict, 'clean');
});

test('GET /api/register is 405', async () => {
  _resetForTests();
  const res = makeRes();
  await registerHandler(makeReq({ method: 'GET', ip: '45.0.0.5' }), res);
  assert.equal(res.statusCode, 405);
});

// --- openapi.js ----------------------------------------------------------------

test('GET /api/openapi.yaml serves the OpenAPI spec as YAML', async () => {
  const res = makeRes();
  await openapiHandler(makeReq({ ip: '50.0.0.1' }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /yaml/);
  assert.match(res.body, /openapi: 3\.1\.0/);
  assert.match(res.body, /\/passage/);
});

test('POST /api/openapi.yaml is 405', async () => {
  const res = makeRes();
  await openapiHandler(makeReq({ method: 'POST', ip: '50.0.0.2' }), res);
  assert.equal(res.statusCode, 405);
});
