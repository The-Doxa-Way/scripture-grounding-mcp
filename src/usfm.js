/**
 * Convert a human-readable Scripture reference (e.g. "John 3:16-17") into the
 * USFM-style passage id the YouVersion Platform API expects
 * (e.g. "JHN.3.16-17"), confirmed live against the API on 2026-07-27:
 *   GET /bibles/{bibleId}/passages/JHN.3.16-17
 * returns the combined text for both verses. Chapter-only references (e.g.
 * "Psalm 23") also work as "PSA.23". Common book abbreviations (e.g. "Jn",
 * "1 Cor", "Ps") are also recognized — see BOOK_TO_USFM.
 *
 * humanRefToUsfm produces SINGLE passage ids, and the YouVersion API only
 * accepts same-chapter ranges in one id (confirmed by live testing) — so it
 * still throws for anything wider than one chapter. Wider scopes (whole
 * books, chapter ranges, cross-chapter verse ranges) are handled by
 * parseHumanRef below, whose structured result lets callers compose multiple
 * per-chapter ids (src/youversion-client.js) or read straight from the
 * committed whole-Bible corpus (src/bible.js).
 */
import { deSmarten } from './normalize.js';

/** Standard USFM 3-letter book codes, keyed by lowercased common English name(s). */
const BOOK_TO_USFM = {
  genesis: 'GEN',
  exodus: 'EXO',
  leviticus: 'LEV',
  numbers: 'NUM',
  deuteronomy: 'DEU',
  joshua: 'JOS',
  judges: 'JDG',
  ruth: 'RUT',
  '1 samuel': '1SA',
  '2 samuel': '2SA',
  '1 kings': '1KI',
  '2 kings': '2KI',
  '1 chronicles': '1CH',
  '2 chronicles': '2CH',
  ezra: 'EZR',
  nehemiah: 'NEH',
  esther: 'EST',
  job: 'JOB',
  psalm: 'PSA',
  psalms: 'PSA',
  proverbs: 'PRO',
  ecclesiastes: 'ECC',
  'song of solomon': 'SNG',
  'song of songs': 'SNG',
  isaiah: 'ISA',
  jeremiah: 'JER',
  lamentations: 'LAM',
  ezekiel: 'EZK',
  daniel: 'DAN',
  hosea: 'HOS',
  joel: 'JOL',
  amos: 'AMO',
  obadiah: 'OBA',
  jonah: 'JON',
  micah: 'MIC',
  nahum: 'NAM',
  habakkuk: 'HAB',
  zephaniah: 'ZEP',
  haggai: 'HAG',
  zechariah: 'ZEC',
  malachi: 'MAL',
  matthew: 'MAT',
  mark: 'MRK',
  luke: 'LUK',
  john: 'JHN',
  acts: 'ACT',
  romans: 'ROM',
  '1 corinthians': '1CO',
  '2 corinthians': '2CO',
  galatians: 'GAL',
  ephesians: 'EPH',
  philippians: 'PHP',
  colossians: 'COL',
  '1 thessalonians': '1TH',
  '2 thessalonians': '2TH',
  '1 timothy': '1TI',
  '2 timothy': '2TI',
  titus: 'TIT',
  philemon: 'PHM',
  hebrews: 'HEB',
  james: 'JAS',
  '1 peter': '1PE',
  '2 peter': '2PE',
  '1 john': '1JN',
  '2 john': '2JN',
  '3 john': '3JN',
  jude: 'JUD',
  revelation: 'REV',
};

/**
 * Common English abbreviations for the books above (the shape an LLM client
 * or a hand-typed reference is just as likely to use as the full name, e.g.
 * "Jn 3:16" or "1 Cor 13") — merged into the lookup, never replacing the
 * full-name entries in BOOK_TO_USFM.
 */
const BOOK_ABBREVIATIONS = {
  gen: 'GEN',
  ex: 'EXO',
  exod: 'EXO',
  lev: 'LEV',
  num: 'NUM',
  deut: 'DEU',
  dt: 'DEU',
  josh: 'JOS',
  judg: 'JDG',
  jdg: 'JDG',
  '1 sam': '1SA',
  '1sa': '1SA',
  '2 sam': '2SA',
  '2sa': '2SA',
  '1 kgs': '1KI',
  '1ki': '1KI',
  '2 kgs': '2KI',
  '2ki': '2KI',
  '1 chr': '1CH',
  '1ch': '1CH',
  '2 chr': '2CH',
  '2ch': '2CH',
  esth: 'EST',
  ps: 'PSA',
  psa: 'PSA',
  pss: 'PSA',
  prov: 'PRO',
  pr: 'PRO',
  eccl: 'ECC',
  eccles: 'ECC',
  song: 'SNG',
  sos: 'SNG',
  isa: 'ISA',
  jer: 'JER',
  lam: 'LAM',
  ezek: 'EZK',
  eze: 'EZK',
  dan: 'DAN',
  hos: 'HOS',
  obad: 'OBA',
  oba: 'OBA',
  jon: 'JON',
  mic: 'MIC',
  nah: 'NAM',
  hab: 'HAB',
  zeph: 'ZEP',
  zep: 'ZEP',
  zech: 'ZEC',
  zec: 'ZEC',
  mal: 'MAL',
  matt: 'MAT',
  mt: 'MAT',
  mrk: 'MRK',
  mk: 'MRK',
  lk: 'LUK',
  jn: 'JHN',
  jhn: 'JHN',
  rom: 'ROM',
  '1 cor': '1CO',
  '1co': '1CO',
  '2 cor': '2CO',
  '2co': '2CO',
  gal: 'GAL',
  eph: 'EPH',
  phil: 'PHP',
  php: 'PHP',
  col: 'COL',
  '1 thess': '1TH',
  '1th': '1TH',
  '2 thess': '2TH',
  '2th': '2TH',
  '1 tim': '1TI',
  '1ti': '1TI',
  '2 tim': '2TI',
  '2ti': '2TI',
  tit: 'TIT',
  philem: 'PHM',
  phm: 'PHM',
  heb: 'HEB',
  jas: 'JAS',
  '1 pet': '1PE',
  '1pe': '1PE',
  '2 pet': '2PE',
  '2pe': '2PE',
  '1 jn': '1JN',
  '1jn': '1JN',
  '2 jn': '2JN',
  '2jn': '2JN',
  '3 jn': '3JN',
  '3jn': '3JN',
  rev: 'REV',
  re: 'REV',
};

const ALL_BOOKS = { ...BOOK_TO_USFM, ...BOOK_ABBREVIATIONS };

/**
 * Resolve a human book name or abbreviation to its USFM 3-letter code.
 * @param {string} name e.g. "Psalm", "1 Cor", "song of songs"
 * @returns {string|null}
 */
export function bookNameToCode(name) {
  return ALL_BOOKS[name.trim().toLowerCase().replace(/\s+/g, ' ')] ?? null;
}

/**
 * @typedef {Object} ParsedRef
 * @property {string} book - book name exactly as the user wrote it
 * @property {string} code - USFM 3-letter book code
 * @property {'verse'|'chapter'|'chapter-range'|'cross-chapter'|'book'} scope
 * @property {number} [chapter] - start chapter (verse/chapter/chapter-range/cross-chapter)
 * @property {number} [verseStart] - (verse/cross-chapter)
 * @property {number} [verseEnd] - (verse)
 * @property {number} [endChapter] - (chapter-range/cross-chapter)
 * @property {number} [endVerse] - (cross-chapter)
 */

/**
 * Parse a human Scripture reference into a structured form covering every
 * scope this project supports:
 *   "John 3:16" / "John 3:16-17"   -> verse
 *   "Romans 8"                     -> chapter
 *   "Romans 1-3"                   -> chapter-range
 *   "John 3:16-4:2"                -> cross-chapter
 *   "Romans"                       -> book
 * Purely syntactic — bounds-checking against the actual corpus (and the
 * single-chapter-book convention, "Jude 3" = Jude 1:3) happens in
 * src/bible.js's resolveRef, which knows chapter/verse counts.
 * @param {string} reference
 * @returns {ParsedRef}
 * @throws {Error} if the book name isn't recognized or the shape doesn't parse
 */
export function parseHumanRef(reference) {
  // deSmarten so an en/em-dash range ("Psalm 46:1–3", common LLM
  // typesetting) parses the same as a plain hyphen range.
  const trimmed = deSmarten(String(reference ?? '')).trim();

  const lookup = (book) => {
    const code = bookNameToCode(book);
    if (!code) throw new Error(`Unrecognized book name "${book}" in reference "${reference}"`);
    return code;
  };

  const crossChapter = trimmed.match(/^(.+?)\s+(\d+):(\d+)\s*-\s*(\d+):(\d+)$/);
  if (crossChapter) {
    const [, book, c1, v1, c2, v2] = crossChapter;
    if (Number(c2) === Number(c1)) {
      // "John 3:16-3:17" is really a same-chapter range.
      return { book, code: lookup(book), scope: 'verse', chapter: Number(c1), verseStart: Number(v1), verseEnd: Number(v2) };
    }
    return {
      book,
      code: lookup(book),
      scope: 'cross-chapter',
      chapter: Number(c1),
      verseStart: Number(v1),
      endChapter: Number(c2),
      endVerse: Number(v2),
    };
  }

  const verseMatch = trimmed.match(/^(.+?)\s+(\d+):(\d+)(?:\s*-\s*(\d+))?$/);
  if (verseMatch) {
    const [, book, chapter, vStart, vEnd] = verseMatch;
    return {
      book,
      code: lookup(book),
      scope: 'verse',
      chapter: Number(chapter),
      verseStart: Number(vStart),
      verseEnd: vEnd ? Number(vEnd) : Number(vStart),
    };
  }

  const chapterRange = trimmed.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)$/);
  if (chapterRange) {
    const [, book, c1, c2] = chapterRange;
    return { book, code: lookup(book), scope: 'chapter-range', chapter: Number(c1), endChapter: Number(c2) };
  }

  const chapterOnly = trimmed.match(/^(.+?)\s+(\d+)$/);
  if (chapterOnly) {
    const [, book, chapter] = chapterOnly;
    return { book, code: lookup(book), scope: 'chapter', chapter: Number(chapter) };
  }

  if (trimmed && bookNameToCode(trimmed)) {
    return { book: trimmed, code: bookNameToCode(trimmed), scope: 'book' };
  }

  throw new Error(
    `Could not parse reference "${reference}". Supported shapes: "Book Chapter:Verse[-Verse]", ` +
      '"Book Chapter[-Chapter]", "Book Chapter:Verse-Chapter:Verse", or a book name alone (e.g. "Romans").'
  );
}

/**
 * @param {string} reference e.g. "John 3:16-17", "Psalm 23", "1 Corinthians 13:4-7", "Jn 3:16"
 * @returns {string} USFM passage id, e.g. "JHN.3.16-17" or "PSA.23"
 * @throws {Error} if the book name isn't recognized or the reference is wider
 *   than one chapter (the YouVersion API takes same-chapter ids only — wider
 *   scopes are composed from multiple ids by src/youversion-client.js)
 */
export function humanRefToUsfm(reference) {
  const parsed = parseHumanRef(reference);
  if (parsed.scope === 'verse') {
    const { code, chapter, verseStart, verseEnd } = parsed;
    return verseEnd !== verseStart ? `${code}.${chapter}.${verseStart}-${verseEnd}` : `${code}.${chapter}.${verseStart}`;
  }
  if (parsed.scope === 'chapter') {
    return `${parsed.code}.${parsed.chapter}`;
  }
  throw new Error(
    `Reference "${reference}" spans more than one chapter — no single USFM passage id exists for it. ` +
      'Use parseHumanRef and compose per-chapter ids instead.'
  );
}
