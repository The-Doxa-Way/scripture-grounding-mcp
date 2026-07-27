import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSuperscription } from '../src/superscription.js';

test('splits a multi-part superscription (Psalm 46) off the body', () => {
  const result = splitSuperscription(
    'For the choirmaster. Of the sons of Korah. According to Alamoth. A song. God is our refuge and strength, an ever-present help in times of trouble.'
  );
  assert.equal(result.superscription, 'For the choirmaster. Of the sons of Korah. According to Alamoth. A song.');
  assert.equal(result.body, 'God is our refuge and strength, an ever-present help in times of trouble.');
});

test('splits a single-sentence superscription (Psalm 23) off the body', () => {
  const result = splitSuperscription('A Psalm of David. The LORD is my shepherd; I shall not want.');
  assert.equal(result.superscription, 'A Psalm of David.');
  assert.equal(result.body, 'The LORD is my shepherd; I shall not want.');
});

test('splits "A song of ascents." (Psalm 121) off the body', () => {
  const result = splitSuperscription('A song of ascents. I lift up my eyes to the hills. From where does my help come?');
  assert.equal(result.superscription, 'A song of ascents.');
  assert.equal(result.body, 'I lift up my eyes to the hills. From where does my help come?');
});

test('returns no superscription for a passage that has none (Psalm 91)', () => {
  const result = splitSuperscription('He who dwells in the shelter of the Most High will abide in the shadow of the Almighty.');
  assert.equal(result.superscription, null);
  assert.equal(result.body, 'He who dwells in the shelter of the Most High will abide in the shadow of the Almighty.');
});

test('returns no superscription for ordinary non-psalm text', () => {
  const result = splitSuperscription('Love is patient, love is kind. It does not envy, it does not boast.');
  assert.equal(result.superscription, null);
});

test('never consumes the entire text — a lone superscription-shaped sentence is left as the body, not stripped to nothing', () => {
  const result = splitSuperscription('A Psalm of David.');
  assert.equal(result.superscription, null);
  assert.equal(result.body, 'A Psalm of David.');
});

test('handles empty/null/undefined input without throwing', () => {
  assert.deepEqual(splitSuperscription(''), { superscription: null, body: '' });
  assert.deepEqual(splitSuperscription(null), { superscription: null, body: '' });
  assert.deepEqual(splitSuperscription(undefined), { superscription: null, body: '' });
});
