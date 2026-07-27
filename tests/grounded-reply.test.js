import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPassage, buildGroundedSystemPrompt, groundedReply } from '../src/grounded-reply.js';
import { createGlooClient } from '../src/gloo-client.js';
import { findByReference } from '../src/fixtures.js';

test('pickPassage matches an anxiety-related question to Philippians 4:6-7', () => {
  const { reference, matchedKeyword } = pickPassage('I am so anxious about my exam tomorrow, what should I do?');
  assert.equal(reference, 'Philippians 4:6-7');
  assert.equal(matchedKeyword, 'anxious');
});

test('pickPassage falls back to the default passage with no matched keyword for an unrelated topic', () => {
  const { reference, matchedKeyword } = pickPassage('what is the capital of France');
  assert.equal(reference, 'Psalm 23:1-6');
  assert.equal(matchedKeyword, null);
});

test('buildGroundedSystemPrompt embeds the canonical text verbatim and requires verbatim quoting', () => {
  const passage = findByReference('Philippians 4:13');
  const prompt = buildGroundedSystemPrompt(passage);
  assert.match(prompt, /Philippians 4:13/);
  assert.ok(prompt.includes(passage.text));
  assert.match(prompt, /verbatim/);
});

test('groundedReply in stub mode (no GLOO_API_KEY) returns a stub reply grounded on the matched passage', async () => {
  const gloo = createGlooClient({ clientId: undefined, clientSecret: undefined });
  const result = await groundedReply({ topicOrQuestion: 'I feel so weary and tired, is there any rest?', glooClient: gloo });
  assert.equal(result.source, 'stub');
  assert.equal(result.groundedOn.reference, 'Matthew 11:28-30');
  assert.ok(result.groundedOn.text.length > 0);
});
