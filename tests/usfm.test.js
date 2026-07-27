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
