import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, tokenize, deSmarten, stripVerseNumbers } from '../src/normalize.js';

test('deSmarten converts curly quotes and dashes to plain ASCII', () => {
  assert.equal(deSmarten('“Hello” — it’s ‘fine’…'), '"Hello" - it\'s \'fine\'...');
});

test('stripVerseNumbers removes standalone numeric tokens but keeps real words', () => {
  assert.equal(stripVerseNumbers('16 For God so loved 3 the world'), '  For God so loved   the world');
});

test('normalize lowercases, strips punctuation, strips verse numbers, collapses whitespace', () => {
  const decorated = '“16 FOR GOD so   loved,\nthe World!”';
  assert.equal(normalize(decorated), 'for god so loved the world');
});

test('normalize is idempotent on already-clean text', () => {
  const clean = 'for god so loved the world';
  assert.equal(normalize(clean), clean);
});

test('normalize treats smart and straight apostrophes the same in contractions', () => {
  const straight = normalize("don't lose heart");
  const curly = normalize('don’t lose heart');
  assert.equal(straight, curly);
  assert.equal(straight, "don't lose heart");
});

test('tokenize splits normalized text into a word array', () => {
  assert.deepEqual(tokenize('“16 For God so loved the world.”'), ['for', 'god', 'so', 'loved', 'the', 'world']);
});

test('normalize handles empty and non-string input without throwing', () => {
  assert.equal(normalize(''), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(null), '');
  assert.deepEqual(tokenize(''), []);
});
