/**
 * Tests for demo/api/_lib/rate-limit.js — the pure per-IP throttle used by
 * the demo API routes. Deterministic and zero-network: `now` is injected so
 * window-reset behavior doesn't depend on real wall-clock time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, getClientIp, _resetForTests, _config } from '../demo/api/_lib/rate-limit.js';

test('allows requests under the per-window limit', () => {
  _resetForTests();
  let now = 0;
  for (let i = 0; i < _config.MAX_REQUESTS_PER_WINDOW; i++) {
    const result = checkRateLimit('1.2.3.4', { now: () => now });
    assert.equal(result.allowed, true, `request ${i} should be allowed`);
  }
});

test('blocks the request that exceeds the per-window limit', () => {
  _resetForTests();
  const now = () => 1000;
  for (let i = 0; i < _config.MAX_REQUESTS_PER_WINDOW; i++) {
    assert.equal(checkRateLimit('5.6.7.8', { now }).allowed, true);
  }
  const blocked = checkRateLimit('5.6.7.8', { now });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});

test('different IPs get independent buckets', () => {
  _resetForTests();
  const now = () => 0;
  for (let i = 0; i < _config.MAX_REQUESTS_PER_WINDOW; i++) {
    checkRateLimit('9.9.9.9', { now });
  }
  assert.equal(checkRateLimit('9.9.9.9', { now }).allowed, false);
  assert.equal(checkRateLimit('1.1.1.1', { now }).allowed, true);
});

test('bucket resets once the window elapses', () => {
  _resetForTests();
  let now = 0;
  for (let i = 0; i < _config.MAX_REQUESTS_PER_WINDOW; i++) {
    checkRateLimit('2.2.2.2', { now: () => now });
  }
  assert.equal(checkRateLimit('2.2.2.2', { now: () => now }).allowed, false);
  now += _config.WINDOW_MS + 1;
  assert.equal(checkRateLimit('2.2.2.2', { now: () => now }).allowed, true);
});

test('getClientIp reads the first x-forwarded-for entry', () => {
  const req = { headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18' } };
  assert.equal(getClientIp(req), '203.0.113.5');
});

test('getClientIp falls back to socket.remoteAddress, then "unknown"', () => {
  assert.equal(getClientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
  assert.equal(getClientIp({ headers: {} }), 'unknown');
});
