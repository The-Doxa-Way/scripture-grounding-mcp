import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanRefToUsfm } from '../src/usfm.js';

test('converts a single-verse reference to USFM', () => {
  assert.equal(humanRefToUsfm('John 3:16'), 'JHN.3.16');
});

test('converts a verse-range reference to USFM using the confirmed same-chapter range syntax', () => {
  assert.equal(humanRefToUsfm('John 3:16-17'), 'JHN.3.16-17');
});

test('converts a chapter-only reference to USFM', () => {
  assert.equal(humanRefToUsfm('Psalm 23'), 'PSA.23');
});

test('handles numbered books (1/2/3 prefix)', () => {
  assert.equal(humanRefToUsfm('1 Corinthians 13:4-7'), '1CO.13.4-7');
  assert.equal(humanRefToUsfm('2 Corinthians 5:17'), '2CO.5.17');
  assert.equal(humanRefToUsfm('1 John 4:18'), '1JN.4.18');
});

test('book name matching is case-insensitive', () => {
  assert.equal(humanRefToUsfm('john 3:16'), 'JHN.3.16');
  assert.equal(humanRefToUsfm('JOHN 3:16'), 'JHN.3.16');
});

test('throws a clear error for an unrecognized book name', () => {
  assert.throws(() => humanRefToUsfm('Nonexistent 1:1'), /Unrecognized book name/);
});

test('throws a clear error for an unparseable reference shape', () => {
  assert.throws(() => humanRefToUsfm('not a reference at all'), /Could not parse reference/);
});

// Regression tests for the 2026-07-27 adversarial-review fixes.

test('en-dash and em-dash verse ranges parse identically to a plain-hyphen range (LLM typesetting fix)', () => {
  assert.equal(humanRefToUsfm('Psalm 46:1–3'), 'PSA.46.1-3'); // en dash
  assert.equal(humanRefToUsfm('Psalm 46:1–3'), humanRefToUsfm('Psalm 46:1-3'));
  assert.equal(humanRefToUsfm('John 3:16—17'), 'JHN.3.16-17'); // em dash
  assert.equal(humanRefToUsfm('John 3:16—17'), humanRefToUsfm('John 3:16-17'));
});

test('common book abbreviations resolve to the same USFM id as the full book name', () => {
  assert.equal(humanRefToUsfm('Jn 3:16'), humanRefToUsfm('John 3:16'));
  assert.equal(humanRefToUsfm('1 Cor 13:4-7'), humanRefToUsfm('1 Corinthians 13:4-7'));
  assert.equal(humanRefToUsfm('Gen 1:1'), humanRefToUsfm('Genesis 1:1'));
  assert.equal(humanRefToUsfm('Ps 23:1'), humanRefToUsfm('Psalm 23:1'));
  assert.equal(humanRefToUsfm('Phil 4:13'), humanRefToUsfm('Philippians 4:13'));
});

test('an unrecognized abbreviation-shaped book still fails loud rather than guessing', () => {
  assert.throws(() => humanRefToUsfm('Xyz 3:16'), /Unrecognized book name/);
  assert.throws(() => humanRefToUsfm('Zx 1:1'), /Unrecognized book name/);
});
