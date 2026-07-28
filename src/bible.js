/**
 * Whole-Bible BSB corpus, parsed lazily from data/bsb.txt (Berean Standard
 * Bible, public domain — see data/PROVENANCE.md for source URL, fetch date,
 * and hash). This is what lets keyless mode serve ANY reference — single
 * verses, whole chapters, cross-chapter ranges, and whole books ("read me
 * Romans") — not just the 34 curated fixtures.
 *
 * Everything here is retrieval of committed canonical text; nothing is ever
 * generated. A psalm's superscription (baked into verse 1's line in bsb.txt)
 * is split out via src/superscription.js exactly as the fixture builder does,
 * so corpus-served text and fixture-served text agree word-for-word.
 *
 * The parse is cached after first use (~31k verses, well under a second) and
 * the data file is resolved via `new URL(..., import.meta.url)` so serverless
 * bundlers (Vercel's file tracing) include it automatically.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { splitSuperscription } from './superscription.js';
// Book name -> USFM code lookup is owned by src/usfm.js (which never imports
// this module, so no cycle); this module needs the name table, not the parser.
import { bookNameToCode } from './usfm.js';

const BSB_PATH = fileURLToPath(new URL('../data/bsb.txt', import.meta.url));

/**
 * @typedef {Object} ParsedRef - structured reference from src/usfm.js's parseHumanRef
 * @property {string} book - book name as written by the user
 * @property {string} code - USFM 3-letter book code
 * @property {'verse'|'chapter'|'chapter-range'|'cross-chapter'|'book'} scope
 * @property {number} [chapter]
 * @property {number} [verseStart]
 * @property {number} [verseEnd]
 * @property {number} [endChapter]
 * @property {number} [endVerse]
 */

/** @typedef {{reference: string, text: string, superscription?: string}} Segment */

/**
 * @type {null | {byCode: Map<string, {code: string, name: string, chapters: string[][]}>, verseCount: number, omittedCount: number}}
 */
let cache = null;

/**
 * Parse data/bsb.txt into per-book chapter/verse arrays. Fails loud (throws)
 * if the file is missing or a book name doesn't resolve — a broken corpus
 * should never be silently served as an empty one.
 * @returns {NonNullable<typeof cache>}
 */
export function loadBible() {
  if (cache) return cache;
  const raw = readFileSync(BSB_PATH, 'utf8');
  const byCode = new Map();
  let verseCount = 0;
  let omittedCount = 0;
  const keyRe = /^(.+) (\d+):(\d+)$/;
  for (const line of raw.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const key = line.slice(0, tab).trim();
    const text = line.slice(tab + 1).trim();
    if (!key) continue;
    const m = key.match(keyRe);
    if (!m) continue; // the 3 header lines
    const [, name, chapterStr, verseStr] = m;
    const code = bookNameToCode(name);
    if (!code) throw new Error(`data/bsb.txt contains unrecognized book name "${name}" — corpus parse aborted.`);
    let book = byCode.get(code);
    if (!book) {
      book = { code, name, chapters: [] };
      byCode.set(code, book);
    }
    const c = Number(chapterStr);
    const v = Number(verseStr);
    if (!book.chapters[c - 1]) book.chapters[c - 1] = [];
    // 16 verses (e.g. Matthew 17:21, Acts 8:37) are OMITTED by the BSB —
    // absent from the earliest manuscripts, their lines in bsb.txt carry an
    // empty text field. Keep the position (as '') so verse numbering stays
    // canonical, and count them separately — never serve them silently.
    book.chapters[c - 1][v - 1] = text;
    if (text) verseCount++;
    else omittedCount++;
  }
  if (verseCount < 30000 || byCode.size !== 66) {
    throw new Error(
      `data/bsb.txt parse looks wrong (${byCode.size} books, ${verseCount} verses) — refusing to serve a partial Bible.`
    );
  }
  cache = { byCode, verseCount, omittedCount };
  return cache;
}

/** @param {string} code @returns {number} chapters in the book (0 if unknown) */
export function chapterCount(code) {
  const book = loadBible().byCode.get(code);
  return book ? book.chapters.length : 0;
}

/** @param {string} code @param {number} chapter @returns {number} verses in the chapter (0 if unknown) */
export function verseCount(code, chapter) {
  const book = loadBible().byCode.get(code);
  const ch = book?.chapters[chapter - 1];
  return ch ? ch.length : 0;
}

/** @param {string} code @returns {string|null} the book's display name as bsb.txt writes it (e.g. "Psalm") */
export function bookDisplayName(code) {
  return loadBible().byCode.get(code)?.name ?? null;
}

/**
 * Normalize + bounds-check a parsed reference against the corpus.
 * Also applies the single-chapter-book convention: "Jude 3" means Jude
 * chapter 1 verse 3 (Jude/Obadiah/Philemon/2 John/3 John have one chapter,
 * and human references conventionally omit it).
 * @param {ParsedRef} parsed
 * @returns {ParsedRef} a new, validated ParsedRef (never mutates the input)
 * @throws {Error} if the book/chapter/verse is out of range
 */
export function resolveRef(parsed) {
  const chapters = chapterCount(parsed.code);
  if (chapters === 0) throw new Error(`Book "${parsed.book}" not found in the BSB corpus.`);
  let out = { ...parsed };

  if (chapters === 1 && out.scope !== 'book') {
    // Single-chapter book: a bare number is a VERSE, not a chapter.
    if (out.scope === 'chapter' && out.chapter > 1) {
      out = { ...out, scope: 'verse', chapter: 1, verseStart: out.chapter, verseEnd: out.chapter };
    } else if (out.scope === 'chapter-range' && out.chapter > 1) {
      out = { ...out, scope: 'verse', verseStart: out.chapter, verseEnd: out.endChapter, chapter: 1, endChapter: undefined };
    }
  }

  const checkChapter = (c) => {
    if (c < 1 || c > chapters) {
      throw new Error(`${bookDisplayName(out.code)} has ${chapters} chapter${chapters === 1 ? '' : 's'} — chapter ${c} is out of range.`);
    }
  };
  const checkVerse = (c, v) => {
    const count = verseCount(out.code, c);
    if (v < 1 || v > count) {
      throw new Error(`${bookDisplayName(out.code)} ${c} has ${count} verses — verse ${v} is out of range.`);
    }
  };

  if (out.scope === 'verse') {
    checkChapter(out.chapter);
    checkVerse(out.chapter, out.verseStart);
    checkVerse(out.chapter, out.verseEnd);
    if (out.verseEnd < out.verseStart) throw new Error(`Verse range ${out.verseStart}-${out.verseEnd} is backwards.`);
  } else if (out.scope === 'chapter') {
    checkChapter(out.chapter);
  } else if (out.scope === 'chapter-range') {
    checkChapter(out.chapter);
    checkChapter(out.endChapter);
    if (out.endChapter <= out.chapter) throw new Error(`Chapter range ${out.chapter}-${out.endChapter} is backwards or empty.`);
  } else if (out.scope === 'cross-chapter') {
    checkChapter(out.chapter);
    checkChapter(out.endChapter);
    if (out.endChapter <= out.chapter) throw new Error(`Cross-chapter range must move forward (got ${out.chapter}:${out.verseStart}-${out.endChapter}:${out.endVerse}).`);
    checkVerse(out.chapter, out.verseStart);
    checkVerse(out.endChapter, out.endVerse);
  }
  return out;
}

/**
 * Build one text segment for a contiguous verse run within a single chapter.
 * @param {string} code
 * @param {number} chapter
 * @param {number} vStart
 * @param {number} vEnd
 * @returns {Segment}
 */
function chapterSegment(code, chapter, vStart, vEnd) {
  const book = loadBible().byCode.get(code);
  const name = book.name;
  const verses = book.chapters[chapter - 1].slice(vStart - 1, vEnd);
  let superscription;
  if (vStart === 1 && verses[0]) {
    // bsb.txt bakes a psalm's superscription into verse 1's line — split it
    // off so segment text is the passage body alone, same as the fixtures.
    const split = splitSuperscription(verses[0]);
    if (split.superscription) {
      superscription = split.superscription;
      verses[0] = split.body;
    }
  }
  const whole = vStart === 1 && vEnd === verseCount(code, chapter);
  const reference = whole
    ? `${name} ${chapter}`
    : vStart === vEnd
      ? `${name} ${chapter}:${vStart}`
      : `${name} ${chapter}:${vStart}-${vEnd}`;
  // Drop BSB-omitted verse positions (empty strings) from the joined text;
  // if the request is ONLY omitted verse(s), fail loud rather than serving
  // silence as Scripture.
  const present = verses.filter((v) => v && v.length > 0);
  if (present.length === 0) {
    throw new Error(
      `${reference} is omitted by the BSB (absent from the earliest manuscripts) — there is no canonical text to serve for it.`
    );
  }
  return { reference, text: present.join(' '), ...(superscription ? { superscription } : {}) };
}

/**
 * Retrieve canonical text for a validated reference, as one segment per
 * chapter (so long-passage callers can work chapter-by-chapter). `text` on
 * the result is the segments joined with blank lines, ready to read.
 * @param {ParsedRef} parsed - pass through resolveRef first (this calls it again defensively)
 * @returns {{reference: string, text: string, segments: Segment[], chapterCount: number}}
 */
export function getBibleText(parsed) {
  const ref = resolveRef(parsed);
  const name = bookDisplayName(ref.code);
  /** @type {Segment[]} */
  let segments;
  let reference;
  if (ref.scope === 'verse') {
    segments = [chapterSegment(ref.code, ref.chapter, ref.verseStart, ref.verseEnd)];
    reference = segments[0].reference;
  } else if (ref.scope === 'chapter') {
    segments = [chapterSegment(ref.code, ref.chapter, 1, verseCount(ref.code, ref.chapter))];
    reference = `${name} ${ref.chapter}`;
  } else if (ref.scope === 'chapter-range') {
    segments = [];
    for (let c = ref.chapter; c <= ref.endChapter; c++) {
      segments.push(chapterSegment(ref.code, c, 1, verseCount(ref.code, c)));
    }
    reference = `${name} ${ref.chapter}-${ref.endChapter}`;
  } else if (ref.scope === 'cross-chapter') {
    segments = [chapterSegment(ref.code, ref.chapter, ref.verseStart, verseCount(ref.code, ref.chapter))];
    for (let c = ref.chapter + 1; c < ref.endChapter; c++) {
      segments.push(chapterSegment(ref.code, c, 1, verseCount(ref.code, c)));
    }
    segments.push(chapterSegment(ref.code, ref.endChapter, 1, ref.endVerse));
    reference = `${name} ${ref.chapter}:${ref.verseStart}-${ref.endChapter}:${ref.endVerse}`;
  } else {
    // whole book
    const chapters = chapterCount(ref.code);
    segments = [];
    for (let c = 1; c <= chapters; c++) {
      segments.push(chapterSegment(ref.code, c, 1, verseCount(ref.code, c)));
    }
    reference = name;
  }
  return {
    reference,
    text: segments.map((s) => s.text).join('\n\n'),
    segments,
    chapterCount: segments.length,
  };
}
