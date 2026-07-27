import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYouVersionClient } from '../src/youversion-client.js';

test('with no appKey, isConfigured is false and getPassage serves from BSB fixtures', async () => {
  const client = createYouVersionClient({ appKey: undefined });
  assert.equal(client.isConfigured, false);
  const result = await client.getPassage('Philippians 4:13');
  assert.equal(result.source, 'fixture');
  assert.match(result.translation, /BSB/);
  assert.match(result.text, /Christ/);
});

test('getPassage in fixture mode returns an error (not a throw) for a reference outside the corpus', async () => {
  const client = createYouVersionClient({ appKey: undefined });
  const result = await client.getPassage('Nonexistent 99:99');
  assert.equal(result.source, 'fixture');
  assert.equal(result.text, null);
  assert.match(result.error, /No fixture found/);
});

test('verseOfTheDay in fixture mode deterministically returns a real fixture, marked as fixture-mode', async () => {
  const client = createYouVersionClient({ appKey: undefined });
  const result = await client.verseOfTheDay();
  assert.equal(result.source, 'fixture');
  assert.ok(result.text.length > 0);
  assert.match(result.note, /not a real VOTD calendar/);
});

test('when a live-mode fetch throws, getPassage falls back to fixture mode instead of propagating the error', async () => {
  const failingFetch = async () => {
    throw new Error('network down');
  };
  const client = createYouVersionClient({ appKey: 'fake-key-for-test', fetchImpl: failingFetch });
  assert.equal(client.isConfigured, true);
  const result = await client.getPassage('Philippians 4:13');
  assert.equal(result.source, 'fixture');
  assert.match(result.note, /network down/);
});

test('when configured and fetch succeeds, getPassage reports source youversion-api', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ content: 'Fake passage text', version_id: 'fake' }),
  });
  const client = createYouVersionClient({ appKey: 'fake-key-for-test', fetchImpl: fakeFetch });
  const result = await client.getPassage('John 3:16-17');
  assert.equal(result.source, 'youversion-api');
  assert.equal(result.text, 'Fake passage text');
});
