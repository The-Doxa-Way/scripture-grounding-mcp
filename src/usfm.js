/**
 * Convert a human-readable Scripture reference (e.g. "John 3:16-17") into the
 * USFM-style passage id the YouVersion Platform API expects
 * (e.g. "JHN.3.16-17"), confirmed live against the API on 2026-07-27:
 *   GET /bibles/{bibleId}/passages/JHN.3.16-17
 * returns the combined text for both verses. Chapter-only references (e.g.
 * "Psalm 23") also work as "PSA.23". Common book abbreviations (e.g. "Jn",
 * "1 Cor", "Ps") are also recognized — see BOOK_TO_USFM.
 *
 * Limitation (documented, not silently swallowed): only same-chapter ranges
 * are supported, since that covers every reference this project needs.
 * Cross-chapter ranges (e.g. "John 3:16-4:2") would need a different USFM
 * shape and are NOT implemented — humanRefToUsfm throws for them.
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
 * @param {string} reference e.g. "John 3:16-17", "Psalm 23", "1 Corinthians 13:4-7", "Jn 3:16"
 * @returns {string} USFM passage id, e.g. "JHN.3.16-17" or "PSA.23"
 * @throws {Error} if the book name isn't recognized or the reference spans chapters
 */
export function humanRefToUsfm(reference) {
  // deSmarten so an en/em-dash verse range ("Psalm 46:1–3", common LLM
  // typesetting) parses the same as a plain hyphen range.
  const trimmed = deSmarten(reference).trim();

  // "Book Chapter" (no verse) -> chapter-level passage, e.g. "Psalm 23" -> PSA.23
  const chapterOnly = trimmed.match(/^(.+?)\s+(\d+)$/);
  const verseMatch = trimmed.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);

  if (verseMatch) {
    const [, book, chapter, vStart, vEnd] = verseMatch;
    const code = ALL_BOOKS[book.trim().toLowerCase()];
    if (!code) throw new Error(`Unrecognized book name "${book}" in reference "${reference}"`);
    return vEnd ? `${code}.${chapter}.${vStart}-${vEnd}` : `${code}.${chapter}.${vStart}`;
  }
  if (chapterOnly) {
    const [, book, chapter] = chapterOnly;
    const code = ALL_BOOKS[book.trim().toLowerCase()];
    if (!code) throw new Error(`Unrecognized book name "${book}" in reference "${reference}"`);
    return `${code}.${chapter}`;
  }
  throw new Error(
    `Could not parse reference "${reference}" as "Book Chapter:Verse[-Verse]" or "Book Chapter" (cross-chapter ranges are not supported)`
  );
}
