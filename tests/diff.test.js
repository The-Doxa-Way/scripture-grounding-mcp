import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff, similarity, summarizeDiff } from '../src/diff.js';

test('similarity is 1.0 for identical token arrays', () => {
  const a = ['for', 'god', 'so', 'loved', 'the', 'world'];
  assert.equal(similarity(a, [...a]), 1);
});

test('similarity is 1.0 for two empty arrays, 0 when only one side is empty', () => {
  assert.equal(similarity([], []), 1);
  assert.equal(similarity(['word'], []), 0);
  assert.equal(similarity([], ['word']), 0);
});

test('similarity drops proportionally to the number of substituted words', () => {
  const a = ['one', 'two', 'three', 'four'];
  const bOneSwap = ['one', 'two', 'three', 'FIVE'];
  const s = similarity(a, bOneSwap);
  // LCS = 3, dice = 2*3/(4+4) = 0.75
  assert.equal(s, 0.75);
});

test('wordDiff reports a pure equal run for identical sequences', () => {
  const a = ['a', 'b', 'c'];
  const ops = wordDiff(a, [...a]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'equal');
  assert.deepEqual(ops[0].a, a);
});

test('wordDiff reports a replace span for a single substituted word', () => {
  const ops = wordDiff(['one', 'two', 'three'], ['one', 'TWO', 'three']);
  assert.equal(ops.length, 3);
  assert.equal(ops[0].op, 'equal');
  assert.equal(ops[1].op, 'replace');
  assert.deepEqual(ops[1].a, ['two']);
  assert.deepEqual(ops[1].b, ['TWO']);
  assert.equal(ops[2].op, 'equal');
});

test('wordDiff reports insert/delete for pure additions/omissions', () => {
  const insertOps = wordDiff(['one', 'three'], ['one', 'two', 'three']);
  assert.ok(insertOps.some((o) => o.op === 'insert' && o.b.includes('two')));

  const deleteOps = wordDiff(['one', 'two', 'three'], ['one', 'three']);
  assert.ok(deleteOps.some((o) => o.op === 'delete' && o.a.includes('two')));
});

test('summarizeDiff counts equal/replaced/inserted/deleted words correctly', () => {
  const ops = wordDiff(['one', 'two', 'three', 'four'], ['one', 'TWO', 'three', 'five', 'four']);
  const summary = summarizeDiff(ops);
  assert.equal(summary.equalWords, 3); // one, three, four
  assert.ok(summary.replacedWords + summary.insertedWords >= 1);
  assert.ok(Array.isArray(summary.spans));
});
