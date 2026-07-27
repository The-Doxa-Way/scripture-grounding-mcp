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
 * Secondary `--web` / `--kjv` modes build bible-api.com's WEB and KJV
 * fixtures (fixtures/web/*.json, fixtures/kjv/*.json) — two more public-
 * domain translations of the same 34 passages, used by verify_quote's
 * cross-translation detection (src/alt-translations.js) so a quote that
 * doesn't match requested-BSB wording can be recognized as an accurate
 * quote of a *different* translation rather than flatly called a misquote.
 * BSB stays the default and the one the server/tests/benchmark treat as
 * ground truth for the requested translation.
 *
 * Usage:
 *   node scripts/build-fixtures.js         # BSB (default, primary)
 *   node scripts/build-fixtures.js --web    # WEB via bible-api.com (secondary)
 *   node scripts/build-fixtures.js --kjv    # KJV via bible-api.com (secondary)
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { splitSuperscription } from '../src/superscription.js';

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
  'Lamentations 3:22-23',
  // prophecy (apocalyptic, e.g. Revelation, is grouped under prophecy for the
  // benchmark's 5-genre taxonomy — see benchmark/METHODOLOGY.md)
  'Isaiah 40:28-31',
  'Isaiah 41:10',
  'Isaiah 53:4-6',
  'Jeremiah 29:11',
  'Micah 6:8',
  'Revelation 21:1-4',
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
];

/**
 * Genre tag used by benchmark/runner.js's per-genre breakdown. Five buckets:
 * narrative, poetry (wisdom literature), prophecy (including apocalyptic),
 * gospel, epistle. Every entry in PASSAGES must have a mapping here — build
 * fails loud (see buildBsbFixture) if one is missing, rather than shipping a
 * fixture with no genre.
 */
const GENRE_BY_REFERENCE = {
  'Genesis 1:1-3': 'narrative',
  'Psalm 23:1-6': 'poetry',
  'Psalm 46:1-3': 'poetry',
  'Psalm 91:1-2': 'poetry',
  'Psalm 121:1-2': 'poetry',
  'Proverbs 3:5-6': 'poetry',
  'Lamentations 3:22-23': 'poetry',
  'Isaiah 40:28-31': 'prophecy',
  'Isaiah 41:10': 'prophecy',
  'Isaiah 53:4-6': 'prophecy',
  'Jeremiah 29:11': 'prophecy',
  'Micah 6:8': 'prophecy',
  'Revelation 21:1-4': 'prophecy',
  'Matthew 5:3-10': 'gospel',
  'Matthew 6:31-34': 'gospel',
  'Matthew 11:28-30': 'gospel',
  'Mark 12:30-31': 'gospel',
  'John 3:16-17': 'gospel',
  'John 14:6': 'gospel',
  'John 14:27': 'gospel',
  'John 16:33': 'gospel',
  'Romans 8:28-39': 'epistle',
  'Romans 12:2': 'epistle',
  '1 Corinthians 13:4-7': 'epistle',
  '2 Corinthians 5:17': 'epistle',
  'Galatians 5:22-23': 'epistle',
  'Ephesians 2:8-9': 'epistle',
  'Philippians 4:6-7': 'epistle',
  'Philippians 4:13': 'epistle',
  'Hebrews 11:1': 'epistle',
  'Hebrews 13:5': 'epistle',
  'James 1:2-4': 'epistle',
  '1 Peter 5:6-7': 'epistle',
  '1 John 4:18': 'epistle',
};

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
  const genre = GENRE_BY_REFERENCE[reference];
  if (!genre) throw new Error(`No genre mapping for "${reference}" — add one to GENRE_BY_REFERENCE.`);
  const parts = [];
  for (let v = verseStart; v <= verseEnd; v++) {
    const key = `${book} ${chapter}:${v}`;
    const text = verseMap.get(key);
    if (!text) throw new Error(`Missing verse "${key}" in bsb.txt for reference "${reference}"`);
    parts.push(text);
  }
  // bsb.txt bakes a psalm's superscription (e.g. "For the choirmaster... A
  // song.") into the same line as verse 1's body text. Split it off verse 1
  // only (a superscription, when present, only ever precedes verse 1) so
  // `text` is the quoted passage alone and the heading is preserved
  // separately, not silently discarded (see src/superscription.js).
  const { superscription, body } = splitSuperscription(parts[0]);
  if (superscription) parts[0] = body;
  return {
    reference,
    translation: 'BSB (Berean Standard Bible, public domain)',
    genre,
    source: sourceUrl,
    fetchedAt: new Date().toISOString(),
    text: parts.join(' '),
    ...(superscription ? { superscription } : {}),
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
// Secondary public-domain translations via bible-api.com (WEB, KJV) — used by
// verify_quote's cross-translation detection (src/alt-translations.js) to
// answer "maybe it's an accurate quote of a DIFFERENT public-domain
// translation" rather than just flagging a BSB mismatch as a flat misquote.
// bible-api.com's KJV/WEB text does not carry a psalm's superscription as
// part of any verse's text at all (confirmed live: Psalm 23/46's verse-1
// text starts directly with the body, e.g. "The LORD\nis my shepherd..."),
// unlike bereanbible.com's BSB — so `splitSuperscription` is applied here for
// symmetry with the BSB path (and in case that ever changes upstream), but
// is expected to be a no-op for both these corpora today.
// ---------------------------------------------------------------------------

const BIBLE_API_BASE = 'https://bible-api.com';
const ALT_TRANSLATIONS = {
  web: { outDir: path.join(__dirname, '..', 'fixtures', 'web'), label: 'WEB (World English Bible, public domain)' },
  kjv: { outDir: path.join(__dirname, '..', 'fixtures', 'kjv'), label: 'KJV (King James Version, public domain)' },
};

async function fetchWithRetry(url, maxRetries = 4) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status === 429 && attempt < maxRetries) {
      const backoffMs = 3000 * (attempt + 1); // free-tier rate limit; back off harder each retry
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    throw new Error(`bible-api.com responded ${res.status}`);
  }
}

async function fetchAltPassage(reference, translationKey) {
  const url = `${BIBLE_API_BASE}/${encodeURIComponent(reference)}?translation=${translationKey}`;
  const res = await fetchWithRetry(url);
  const data = await res.json();
  if (!data.text || !data.text.trim()) throw new Error(`${reference}: empty text in response`);
  const cleaned = data.text.trim().replace(/\n{2,}/g, '\n').replace(/[ \t]+\n/g, '\n');
  const { superscription, body } = splitSuperscription(cleaned);
  return {
    // Use OUR canonical reference string (the PASSAGES entry), not the API's
    // own `data.reference` — bible-api.com pluralizes "Psalm" to "Psalms"
    // (e.g. "Psalms 23:1-6"), which would silently break cross-corpus
    // lookups by reference against the BSB fixtures (keyed "Psalm 23:1-6").
    reference,
    translation: ALT_TRANSLATIONS[translationKey].label,
    source: url,
    fetchedAt: new Date().toISOString(),
    text: superscription ? body : cleaned,
    ...(superscription ? { superscription } : {}),
  };
}

async function buildAlt(translationKey) {
  const { outDir } = ALT_TRANSLATIONS[translationKey];
  mkdirSync(outDir, { recursive: true });
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const reference of PASSAGES) {
    const filename = `${slugify(reference)}.json`;
    const filePath = path.join(outDir, filename);
    // Resume-safe: bible-api.com's free tier rate-limits aggressively, so a
    // rerun after a partial failure should not re-spend calls on passages
    // already fetched successfully.
    if (existsSync(filePath)) {
      skipped++;
      continue;
    }
    try {
      const fixture = await fetchAltPassage(reference, translationKey);
      writeFileSync(filePath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
      console.log(`OK   ${fixture.reference} -> ${filename} (${fixture.text.length} chars)`);
      ok++;
    } catch (err) {
      console.error(`FAIL ${reference}: ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 1000)); // be polite to the free public API (rate-limits at short intervals)
  }
  console.log(`\n${translationKey.toUpperCase()}: fetched ${ok} passages, ${failed} failed, ${skipped} already cached.`);
  return failed === 0;
}

async function main() {
  const args = process.argv.slice(2);
  const wantWeb = args.includes('--web');
  const wantKjv = args.includes('--kjv');
  let success = true;
  if (wantWeb) success = (await buildAlt('web')) && success;
  if (wantKjv) success = (await buildAlt('kjv')) && success;
  if (!wantWeb && !wantKjv) success = await buildBsb();
  if (!success) process.exitCode = 1;
}

main();
