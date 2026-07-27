import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  localCandidateTranslations,
  findClosestCanon,
  fetchRemoteVersionCandidates,
  findClosestCanonWithRemote,
} from '../src/alt-translations.js';
import { tokenize } from '../src/normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

test('localCandidateTranslations returns BSB, WEB, and KJV for a passage covered by all three corpora', () => {
  const candidates = localCandidateTranslations('Psalm 23:1-6');
  const translations = candidates.map((c) => c.translation);
  assert.ok(translations.some((t) => t.startsWith('BSB')), 'expected a BSB candidate');
  assert.ok(translations.some((t) => t.startsWith('WEB')), 'expected a WEB candidate');
  assert.ok(translations.some((t) => t.startsWith('KJV')), 'expected a KJV candidate');
});

test('localCandidateTranslations returns an empty-ish list for a reference outside every corpus', () => {
  const candidates = localCandidateTranslations('Zephaniah 3:99');
  assert.deepEqual(candidates, []);
});

test('findClosestCanon picks BSB when the quote is verbatim BSB', () => {
  const bsbText = JSON.parse(readFileSync(path.join(REPO_ROOT, 'fixtures/bsb/psalm-23-1-6.json'), 'utf8')).text;
  const best = findClosestCanon('Psalm 23:1-6', tokenize(bsbText));
  assert.equal(best.translation, 'BSB (Berean Standard Bible, public domain)');
  assert.equal(best.score, 1);
});

test('findClosestCanon picks KJV when the quote is verbatim KJV (and not the requested BSB)', () => {
  const kjvText = JSON.parse(readFileSync(path.join(REPO_ROOT, 'fixtures/kjv/psalm-23-1-6.json'), 'utf8')).text;
  const best = findClosestCanon('Psalm 23:1-6', tokenize(kjvText));
  assert.equal(best.translation, 'KJV (King James Version, public domain)');
  assert.equal(best.score, 1);
});

test('findClosestCanon returns null for empty/garbage token input', () => {
  assert.equal(findClosestCanon('Psalm 23:1-6', []), null);
  assert.equal(findClosestCanon('Psalm 23:1-6', null), null);
});

test('every one of the 34 benchmark passages has a WEB and a KJV fixture (parity with the BSB corpus)', () => {
  const bsbFiles = readdirSync(path.join(REPO_ROOT, 'fixtures/bsb')).filter((f) => f.endsWith('.json'));
  const webFiles = new Set(readdirSync(path.join(REPO_ROOT, 'fixtures/web')).filter((f) => f.endsWith('.json')));
  const kjvFiles = new Set(readdirSync(path.join(REPO_ROOT, 'fixtures/kjv')).filter((f) => f.endsWith('.json')));
  assert.equal(bsbFiles.length, 34);
  for (const f of bsbFiles) {
    assert.ok(webFiles.has(f), `missing WEB fixture for ${f}`);
    assert.ok(kjvFiles.has(f), `missing KJV fixture for ${f}`);
  }
});

test('WEB and KJV fixtures never carry a superscription field for these 34 passages (bible-api.com does not bake one into verse text)', () => {
  for (const corpus of ['web', 'kjv']) {
    const dir = path.join(REPO_ROOT, 'fixtures', corpus);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const fixture = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
      assert.equal(fixture.superscription, undefined, `${corpus}/${file} should have no superscription field`);
    }
  }
});

// --- Licensed-translation (YouVersion-keyed) multi-version comparison ---
// (founder-directed 2026-07-27, flag-gated — see README's "Multi-version
// detection" section). These tests inject a FAKE fetchVersion — no real
// network call, no licensed text anywhere near the test suite.

test('fetchRemoteVersionCandidates returns a translation/text pair for a version that fetches successfully', async () => {
  const fetchVersion = async (reference, versionId) => {
    assert.equal(reference, 'Philippians 4:13');
    return { text: 'FAKE NIV-style rendering.', translation: 'NIV', source: 'youversion-api' };
  };
  const results = await fetchRemoteVersionCandidates('Philippians 4:13', fetchVersion, ['111']);
  assert.equal(results.length, 1);
  assert.equal(results[0].versionId, '111');
  assert.equal(results[0].skipped, undefined);
  assert.match(results[0].translation, /NIV/);
  assert.equal(results[0].text, 'FAKE NIV-style rendering.');
});

test('fetchRemoteVersionCandidates skips a version gracefully (never throws) when the client falls back to fixture (inaccessible/unlicensed id)', async () => {
  const fetchVersion = async () => ({
    text: 'some fixture fallback text',
    translation: 'BSB (Berean Standard Bible, public domain)',
    source: 'fixture',
    note: 'YouVersion API call failed (YouVersion API responded 403 for /bibles/100/passages/PHP.4.13); served from fixture instead.',
  });
  const results = await fetchRemoteVersionCandidates('Philippians 4:13', fetchVersion, ['100']);
  assert.equal(results.length, 1);
  assert.equal(results[0].skipped, true);
  assert.match(results[0].note, /100:.*403/);
});

test('fetchRemoteVersionCandidates skips gracefully (never throws) when fetchVersion itself rejects', async () => {
  const fetchVersion = async () => {
    throw new Error('network down');
  };
  const results = await fetchRemoteVersionCandidates('Philippians 4:13', fetchVersion, ['999']);
  assert.equal(results.length, 1);
  assert.equal(results[0].skipped, true);
  assert.match(results[0].note, /999: network down/);
});

test('fetchRemoteVersionCandidates handles a mix of one success and one failure independently, in order', async () => {
  const fetchVersion = async (reference, versionId) => {
    if (versionId === '111') return { text: 'FAKE NIV text.', translation: 'NIV', source: 'youversion-api' };
    throw new Error('unreachable');
  };
  const results = await fetchRemoteVersionCandidates('Philippians 4:13', fetchVersion, ['111', '999']);
  assert.equal(results.length, 2);
  assert.equal(results[0].skipped, undefined);
  assert.equal(results[1].skipped, true);
});

test('findClosestCanonWithRemote picks a remote candidate when it scores higher than every local one', async () => {
  const fetchVersion = async () => ({
    text: 'FAKE remote rendering that matches the quote exactly.',
    translation: 'FAKE-VERSION',
    source: 'youversion-api',
  });
  const quoteTokens = tokenize('FAKE remote rendering that matches the quote exactly.');
  const { best, remoteResults } = await findClosestCanonWithRemote('Philippians 4:13', quoteTokens, {
    fetchVersion,
    versionIds: ['999'], // outside KNOWN_VERSION_NAMES, so the fetch's own `translation` passes through unmodified
  });
  assert.equal(best.translation, 'FAKE-VERSION');
  assert.equal(best.score, 1);
  assert.equal(remoteResults.length, 1);
});

test('findClosestCanonWithRemote falls back to the best LOCAL candidate when every remote version is skipped', async () => {
  const fetchVersion = async () => {
    throw new Error('access denied');
  };
  const bsbText = JSON.parse(readFileSync(path.join(REPO_ROOT, 'fixtures/bsb/philippians-4-13.json'), 'utf8')).text;
  const quoteTokens = tokenize(bsbText);
  const { best, remoteResults } = await findClosestCanonWithRemote('Philippians 4:13', quoteTokens, {
    fetchVersion,
    versionIds: ['111'],
  });
  assert.equal(best.translation, 'BSB (Berean Standard Bible, public domain)');
  assert.equal(remoteResults.length, 1);
  assert.equal(remoteResults[0].skipped, true);
});

test('findClosestCanonWithRemote with no fetchVersion behaves like local-only findClosestCanon (empty remoteResults)', async () => {
  const bsbText = JSON.parse(readFileSync(path.join(REPO_ROOT, 'fixtures/bsb/psalm-23-1-6.json'), 'utf8')).text;
  const quoteTokens = tokenize(bsbText);
  const { best, remoteResults } = await findClosestCanonWithRemote('Psalm 23:1-6', quoteTokens, {});
  const localOnly = findClosestCanon('Psalm 23:1-6', quoteTokens);
  assert.deepEqual(best, localOnly);
  assert.deepEqual(remoteResults, []);
});
