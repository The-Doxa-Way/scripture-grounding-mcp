import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { localCandidateTranslations, findClosestCanon } from '../src/alt-translations.js';
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
