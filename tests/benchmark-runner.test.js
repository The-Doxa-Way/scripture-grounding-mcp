import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNGROUNDED_SYSTEM_PROMPT, ungroundedUserMessage, groundedSystemPrompt, groundedUserMessage } from '../benchmark/runner.js';

test('ungrounded prompt asks for BSB wording with no context and no reference/commentary', () => {
  assert.match(UNGROUNDED_SYSTEM_PROMPT, /Berean Standard Bible/);
  assert.match(UNGROUNDED_SYSTEM_PROMPT, /from memory/);
  assert.equal(ungroundedUserMessage('John 3:16-17'), 'Quote John 3:16-17 exactly from the Berean Standard Bible.');
});

test('grounded prompt embeds the exact canonical text and instructs verbatim presentation', () => {
  const prompt = groundedSystemPrompt('Psalm 23:1-6', 'The LORD is my shepherd...');
  assert.match(prompt, /Psalm 23:1-6/);
  assert.match(prompt, /"The LORD is my shepherd\.\.\."/);
  assert.match(prompt, /exactly as given above/);
  assert.equal(groundedUserMessage('Psalm 23:1-6'), 'Give me the exact text of Psalm 23:1-6.');
});
