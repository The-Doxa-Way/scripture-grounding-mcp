import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJsonlContent,
  indexByReference,
  loadRawCache,
  appendRawRecord,
  referencesNeedingFetch,
} from '../benchmark/lib/raw-cache.js';

test('parseJsonlContent parses one record per line and skips blank lines', () => {
  const content = '{"reference":"A"}\n\n{"reference":"B"}\n';
  const records = parseJsonlContent(content);
  assert.deepEqual(records, [{ reference: 'A' }, { reference: 'B' }]);
});

test('parseJsonlContent tolerates a truncated final line (crash mid-write) without losing prior records', () => {
  const content = '{"reference":"A"}\n{"reference":"B"}\n{"reference":"C","raw'; // truncated
  assert.deepEqual(parseJsonlContent(content), [{ reference: 'A' }, { reference: 'B' }]);
});

test('indexByReference keys records by reference, last write wins on duplicates', () => {
  const map = indexByReference([
    { reference: 'A', v: 1 },
    { reference: 'B', v: 1 },
    { reference: 'A', v: 2 },
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get('A').v, 2);
});

test('loadRawCache returns an empty Map when the file does not exist (first run)', () => {
  const fakeFs = { existsSync: () => false };
  const cache = loadRawCache('/nonexistent/raw-ungrounded.jsonl', fakeFs);
  assert.equal(cache.size, 0);
});

test('loadRawCache reads and indexes an existing file', () => {
  const fakeFs = {
    existsSync: () => true,
    readFileSync: () => '{"reference":"John 3:16-17","rawText":"..."}\n',
  };
  const cache = loadRawCache('/fake/raw-grounded.jsonl', fakeFs);
  assert.equal(cache.size, 1);
  assert.equal(cache.get('John 3:16-17').rawText, '...');
});

test('appendRawRecord creates the parent dir and appends a JSON line via the injected fs', () => {
  const calls = { mkdir: [], append: [] };
  const fakeFs = {
    mkdirSync: (dir, opts) => calls.mkdir.push({ dir, opts }),
    appendFileSync: (file, data) => calls.append.push({ file, data }),
  };
  appendRawRecord('/fake/dir/raw-ungrounded.jsonl', { reference: 'A', rawText: 'hi' }, fakeFs);
  assert.equal(calls.mkdir.length, 1);
  assert.equal(calls.mkdir[0].opts.recursive, true);
  assert.equal(calls.append.length, 1);
  assert.equal(calls.append[0].data, JSON.stringify({ reference: 'A', rawText: 'hi' }) + '\n');
});

test('referencesNeedingFetch returns only references absent from the cache (the resume decision)', () => {
  const cache = new Map([['A', {}], ['C', {}]]);
  const needed = referencesNeedingFetch(['A', 'B', 'C', 'D'], cache);
  assert.deepEqual(needed, ['B', 'D']);
});

test('referencesNeedingFetch returns an empty array when everything is already cached (full resume, zero re-spend)', () => {
  const cache = new Map([['A', {}], ['B', {}]]);
  assert.deepEqual(referencesNeedingFetch(['A', 'B'], cache), []);
});
