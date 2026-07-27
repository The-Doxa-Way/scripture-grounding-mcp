#!/usr/bin/env node
/**
 * Fetches passage text for a fixed list of well-known references and writes
 * them to fixtures/bsb/*.json.
 *
 * Primary source: the Berean Standard Bible (BSB) — dedicated to the public
 * domain by the Berean Bible Translation Committee, and Doxa's house
 * translation. bible-api.com (the other public-domain option this project
 * originally used) does NOT serve BSB (confirmed: its /data translation
 * list has no "bsb" identifier — WEB, KJV, ASV, etc. only), so BSB fixtures
 * are built from the official whole-Bible download at
 * https://bereanbible.com/bsb.txt (tab-separated `Book Chapter:Verse<TAB>Text`
 * per line; header states "This text of God's Word has been dedicated to
 * the public domain"). This script downloads that file fresh every run,
 * parses only the verse ranges it needs, and writes them with full
 * provenance — never hand-typed, never from model memory.
 *
 * A secondary `--web` mode is kept for building bible-api.com/WEB fixtures
 * (fixtures/web/*.json) in case a second public-domain translation is
 * useful later (e.g. cross-translation benchmark comparison), but BSB is
 * the default and the one the server/tests/benchmark treat as ground truth.
 *
 * Usage:
 *   node scripts/build-fixtures.js         # BSB (default, primary)
 *   node scripts/build-fixtures.js --web    # WEB via bible-api.com (secondary)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Passage list chosen for genre coverage: narrative, poetry/wisdom,
 * prophecy, gospel, epistle, apocalyptic. Includes every passage named
 * explicitly in the project brief plus additional passages so
 * verify_quote's misattribution search and grounded_reply's keyword map
 * have a meaningfully-sized corpus to work against.
 *
 * Book names use BSB's own naming convention (e.g. "Psalm" singular, not
 * "Psalms") since references are looked up directly against bsb.txt's keys.
 */
const PASSAGES = [
  // narrative
  'Genesis 1:1-3',
  // poetry / wisdom
  'Psalm 23:1-6',
  'Psalm 46:1-3',
  'Psalm 91:1-2',
  'Psalm 121:1-2',
  'Proverbs 3:5-6',
  // prophecy
  'Isaiah 40:28-31',
  'Isaiah 41:10',
  'Isaiah 53:4-6',
  'Jeremiah 29:11',
  'Lamentations 3:22-23',
  'Micah 6:8',
  // gospel
  'Matthew 5:3-10',
  'Matthew 6:31-34',
  'Matthew 11:28-30',
  'Mark 12:30-31',
  'John 3:16-17',
  'John 14:6',
  'John 14:27',
  'John 16:33',
  // epistle
  'Romans 8:28-39',
  'Romans 12:2',
  '1 Corinthians 13:4-7',
  '2 Corinthians 5:17',
  'Galatians 5:22-23',
  'Ephesians 2:8-9',
  'Philippians 4:6-7',
  'Philippians 4:13',
  'Hebrews 11:1',
  'Hebrews 13:5',
  'James 1:2-4',
  '1 Peter 5:6-7',
  '1 John 4:18',
  // apocalyptic
  'Revelation 21:1-4',
];

function slugify(reference) {
  return reference
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Parse "Book[ Number] Chapter:VerseStart[-VerseEnd]" into parts. */
function parseReference(reference) {
  const m = reference.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error(`Could not parse reference "${reference}"`);
  const [, book, chapter, vStart, vEnd] = m;
  return {
    book,
    chapter: Number(chapter),
    verseStart: Number(vStart),
    verseEnd: vEnd ? Number(vEnd) : Number(vStart),
  };
}

// ---------------------------------------------------------------------------
// BSB (primary)
// ---------------------------------------------------------------------------

const BSB_URL = 'https://bereanbible.com/bsb.txt';
const BSB_OUT_DIR = path.join(__dirname, '..', 'fixtures', 'bsb');

async function fetchBsbVerseMap() {
  const res = await fetch(BSB_URL, { headers: { 'User-Agent': 'scripture-grounding-mcp fixture builder' } });
  if (!res.ok) throw new Error(`bereanbible.com/bsb.txt responded ${res.status}`);
  const raw = await res.text();
  const lines = raw.split('\n');
  const map = new Map();
  const keyRe = /^(.+) (\d+):(\d+)$/;
  for (const line of lines) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const key = line.slice(0, tab).trim();
    const text = line.slice(tab + 1).trim();
    if (!key || !text) continue;
    if (!keyRe.test(key)) continue; // skips the 3 header lines
    map.set(key, text);
  }
  return map;
}

function buildBsbFixture(reference, verseMap, sourceUrl) {
  const { book, chapter, verseStart, verseEnd } = parseReference(reference);
  const parts = [];
  for (let v = verseStart; v <= verseEnd; v++) {
    const key = `${book} ${chapter}:${v}`;
    const text = verseMap.get(key);
    if (!text) throw new Error(`Missing verse "${key}" in bsb.txt for reference "${reference}"`);
    parts.push(text);
  }
  return {
    reference,
    translation: 'BSB (Berean Standard Bible, public domain)',
    source: sourceUrl,
    fetchedAt: new Date().toISOString(),
    text: parts.join(' '),
  };
}

async function buildBsb() {
  mkdirSync(BSB_OUT_DIR, { recursive: true });
  console.log(`Downloading ${BSB_URL} ...`);
  const verseMap = await fetchBsbVerseMap();
  console.log(`Parsed ${verseMap.size} verses from bsb.txt.`);
  let ok = 0;
  let failed = 0;
  for (const reference of PASSAGES) {
    try {
      const fixture = buildBsbFixture(reference, verseMap, BSB_URL);
      const filename = `${slugify(fixture.reference)}.json`;
      writeFileSync(path.join(BSB_OUT_DIR, filename), JSON.stringify(fixture, null, 2) + '\n', 'utf8');
      console.log(`OK   ${fixture.reference} -> ${filename} (${fixture.text.length} chars)`);
      ok++;
    } catch (err) {
      console.error(`FAIL ${reference}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\nBSB: fetched ${ok} passages, ${failed} failed.`);
  return failed === 0;
}

// ---------------------------------------------------------------------------
// WEB via bible-api.com (secondary, optional)
// ---------------------------------------------------------------------------

const WEB_API_BASE = 'https://bible-api.com';
const WEB_OUT_DIR = path.join(__dirname, '..', 'fixtures', 'web');

async function fetchWebPassage(reference) {
  const url = `${WEB_API_BASE}/${encodeURIComponent(reference)}?translation=web`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${reference}: bible-api.com responded ${res.status}`);
  const data = await res.json();
  if (!data.text || !data.text.trim()) throw new Error(`${reference}: empty text in response`);
  return {
    reference: data.reference,
    translation: 'WEB (World English Bible, public domain)',
    source: url,
    fetchedAt: new Date().toISOString(),
    text: data.text.trim().replace(/\n{2,}/g, '\n').replace(/[ \t]+\n/g, '\n'),
  };
}

async function buildWeb() {
  mkdirSync(WEB_OUT_DIR, { recursive: true });
  let ok = 0;
  let failed = 0;
  for (const reference of PASSAGES) {
    try {
      const fixture = await fetchWebPassage(reference);
      const filename = `${slugify(fixture.reference)}.json`;
      writeFileSync(path.join(WEB_OUT_DIR, filename), JSON.stringify(fixture, null, 2) + '\n', 'utf8');
      console.log(`OK   ${fixture.reference} -> ${filename} (${fixture.text.length} chars)`);
      ok++;
    } catch (err) {
      console.error(`FAIL ${reference}: ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite to the free public API
  }
  console.log(`\nWEB: fetched ${ok} passages, ${failed} failed.`);
  return failed === 0;
}

async function main() {
  const mode = process.argv.includes('--web') ? 'web' : 'bsb';
  const success = mode === 'web' ? await buildWeb() : await buildBsb();
  if (!success) process.exitCode = 1;
}

main();
