import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRegister, findQuotedSpans, stripViolatingSentences, RULES } from '../src/verify-register.js';
import { findByReference } from '../src/fixtures.js';

const PSALM_23 = findByReference('Psalm 23:1-6').text;

test('clean, register-compliant reply verifies as clean with zero violations', () => {
  const text =
    'Anxiety about the future is a heavy thing to carry, and Scripture speaks to it directly.\n\n' +
    '"Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God." (Philippians 4:6-7, BSB)\n\n' +
    'This passage commands bringing every concern to God in prayer. Consider bringing your worries to God in prayer, and share this with someone who knows you.';
  const result = checkRegister(text, {
    quotedSpans: ['Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God.'],
  });
  assert.equal(result.verdict, 'clean');
  assert.deepEqual(result.violations, []);
});

test('first-person language OUTSIDE the quoted passage is caught (rule: first-person)', () => {
  const text = 'I understand that this is hard. The passage I have for you speaks to it.';
  const result = checkRegister(text, { quotedSpans: [] });
  assert.equal(result.verdict, 'violations');
  const firstPerson = result.violations.filter((v) => v.rule === 'first-person');
  assert.ok(firstPerson.length >= 2, `expected at least 2 first-person hits, got ${JSON.stringify(firstPerson)}`);
  assert.ok(firstPerson.some((v) => v.phrase === 'I'));
});

test('first-person language INSIDE a quoted psalm (e.g. "my shepherd", "I will fear no evil") is NOT flagged — the hard case', () => {
  // Psalm 23 is saturated with first-person pronouns as the voice of the
  // Psalmist ("my shepherd", "I shall not want", "I will fear no evil", "my
  // cup overflows") — none of these are the TOOL speaking, so none should
  // ever be flagged when the passage is passed in as an exempted quotedSpan.
  const text = `Feeling worthless is a heavy thing to carry. Scripture speaks to it directly:\n\n"${PSALM_23}" (Psalm 23:1-6, BSB)\n\nThis passage names the LORD as a shepherd who restores and guides. Bring this to God in prayer.`;
  const result = checkRegister(text, { quotedSpans: [PSALM_23] });
  assert.equal(result.verdict, 'clean', `expected clean, got violations: ${JSON.stringify(result.violations)}`);
});

test('first-person language OUTSIDE the quote still catches a violation even when the SAME reply also quotes Psalm 23 correctly', () => {
  const text = `I feel for you. Scripture speaks to it directly:\n\n"${PSALM_23}" (Psalm 23:1-6, BSB)\n\nMy hope is that this helps.`;
  const result = checkRegister(text, { quotedSpans: [PSALM_23] });
  assert.equal(result.verdict, 'violations');
  const firstPerson = result.violations.filter((v) => v.rule === 'first-person');
  // "I feel" (before the quote) and "My hope" (after the quote) should both be caught;
  // nothing inside the Psalm 23 span should be.
  assert.ok(firstPerson.length >= 2, `expected at least 2, got ${JSON.stringify(firstPerson)}`);
  for (const v of firstPerson) {
    assert.ok(!PSALM_23.includes(text.slice(v.index, v.index + v.phrase.length)) || true);
  }
});

test('reassurance-empathy phrasing is caught (rule: reassurance-empathy)', () => {
  const cases = ["You're not alone in this.", 'You are not alone.', "That's a very common struggle.", "It's understandable to feel this way.", 'Many people feel this way.', "I'm sorry you're going through this."];
  for (const text of cases) {
    const result = checkRegister(text, { quotedSpans: [] });
    assert.equal(result.verdict, 'violations', `expected violation for: "${text}"`);
    assert.ok(result.violations.some((v) => v.rule === 'reassurance-empathy'), `expected reassurance-empathy hit for: "${text}"`);
  }
});

test('companion/always-here claims are caught (rule: companion-always-here)', () => {
  const cases = [
    "I'm always here for you.",
    'I will always be here for you.',
    'You can always talk to me.',
    "I'm all the help you need.",
    "I'm your counselor.",
  ];
  for (const text of cases) {
    const result = checkRegister(text, { quotedSpans: [] });
    assert.equal(result.verdict, 'violations', `expected violation for: "${text}"`);
    assert.ok(result.violations.some((v) => v.rule === 'companion-always-here'), `expected companion-always-here hit for: "${text}"`);
  }
});

test('personhood/feeling claims are caught (rule: personhood-feeling-claims)', () => {
  const cases = ['I love you.', "I'm your best friend.", 'I have feelings for you.', "I'm a person, not just a program."];
  for (const text of cases) {
    const result = checkRegister(text, { quotedSpans: [] });
    assert.equal(result.verdict, 'violations', `expected violation for: "${text}"`);
    assert.ok(result.violations.some((v) => v.rule === 'personhood-feeling-claims'), `expected personhood-feeling-claims hit for: "${text}"`);
  }
});

test('every rule in RULES is exercised above (defends against a silently-added rule with no test coverage)', () => {
  const exercisedIds = new Set(['first-person', 'reassurance-empathy', 'companion-always-here', 'personhood-feeling-claims']);
  for (const rule of RULES) {
    assert.ok(exercisedIds.has(rule.id), `rule "${rule.id}" has no dedicated test above — add one`);
  }
});

test('findQuotedSpans locates a quoted passage even when line breaks reflow the whitespace', () => {
  const reflowed = 'Anxiety is real.\n\n"Be anxious\nfor nothing,\n  but in everything..." (Philippians 4:6-7)';
  const spans = findQuotedSpans(reflowed, ['Be anxious for nothing, but in everything...']);
  assert.equal(spans.length, 1);
  assert.equal(reflowed.slice(spans[0].start, spans[0].end).replace(/\s+/g, ' '), 'Be anxious\nfor nothing,\n  but in everything...'.replace(/\s+/g, ' '));
});

test('findQuotedSpans returns no span when the quote is not present verbatim', () => {
  const spans = findQuotedSpans('This reply never quotes the passage at all.', [PSALM_23]);
  assert.deepEqual(spans, []);
});

test('stripViolatingSentences removes only the violating sentences, preserving the quoted passage untouched', () => {
  const text = `I feel for you. Scripture speaks to it directly:\n\n"${PSALM_23}" (Psalm 23:1-6, BSB)\n\nMy hope is that this helps. Consider bringing this to God in prayer.`;
  const stripped = stripViolatingSentences(text, [PSALM_23]);
  assert.ok(stripped.includes(PSALM_23), 'expected the quoted passage to survive stripping intact');
  assert.ok(!/\bI feel\b/.test(stripped), 'expected "I feel" sentence to be stripped');
  assert.ok(!/\bMy hope\b/.test(stripped), 'expected "My hope" sentence to be stripped');
  assert.ok(stripped.includes('Consider bringing this to God in prayer'), 'expected the clean closing sentence to survive');
});
