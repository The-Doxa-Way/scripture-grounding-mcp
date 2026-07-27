import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, findByReference, findBestMatch, fixtureCount } from '../src/fixtures.js';

test('loads at least 30 BSB fixtures, each fetched (not hand-written) with provenance', () => {
  const fixtures = loadFixtures();
  assert.ok(fixtures.length >= 30, `expected >=30 fixtures, got ${fixtures.length}`);
  assert.equal(fixtureCount(), fixtures.length);
  for (const f of fixtures) {
    assert.equal(typeof f.reference, 'string');
    assert.ok(f.reference.length > 0);
    assert.match(f.translation, /BSB/);
    assert.match(f.source, /^https:\/\//);
    assert.ok(!Number.isNaN(Date.parse(f.fetchedAt)), `fetchedAt should be a valid date for ${f.reference}`);
    assert.ok(f.text.length > 0);
  }
});

test('findByReference is case- and whitespace-insensitive', () => {
  const exact = findByReference('John 3:16-17');
  assert.ok(exact);
  assert.equal(findByReference('john 3:16-17')?.reference, exact.reference);
  assert.equal(findByReference('  John 3:16-17  ')?.reference, exact.reference);
});

test('findByReference returns undefined for a reference not in the corpus', () => {
  assert.equal(findByReference('Nonexistent 99:99'), undefined);
});

test('findBestMatch finds the exact source passage for an unmodified quote', () => {
  const phil413 = findByReference('Philippians 4:13');
  const best = findBestMatch(phil413.text);
  assert.equal(best.reference, 'Philippians 4:13');
  assert.ok(best.score > 0.99);
});

test('findBestMatch returns null for empty/garbage input', () => {
  assert.equal(findBestMatch(''), null);
  assert.equal(findBestMatch('   '), null);
});
