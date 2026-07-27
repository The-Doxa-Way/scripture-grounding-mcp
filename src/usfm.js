/**
 * Convert a human-readable Scripture reference (e.g. "John 3:16-17") into the
 * USFM-style passage id the YouVersion Platform API expects
 * (e.g. "JHN.3.16-17"), confirmed live against the API on 2026-07-27:
 *   GET /bibles/{bibleId}/passages/JHN.3.16-17
 * returns the combined text for both verses. Chapter-only references (e.g.
 * "Psalm 23") also work as "PSA.23".
 *
 * Limitation (documented, not silently swallowed): only same-chapter ranges
 * are supported, since that covers every reference this project needs.
 * Cross-chapter ranges (e.g. "John 3:16-4:2") would need a different USFM
 * shape and are NOT implemented — humanRefToUsfm throws for them.
 */

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
 * @param {string} reference e.g. "John 3:16-17", "Psalm 23", "1 Corinthians 13:4-7"
 * @returns {string} USFM passage id, e.g. "JHN.3.16-17" or "PSA.23"
 * @throws {Error} if the book name isn't recognized or the reference spans chapters
 */
export function humanRefToUsfm(reference) {
  const trimmed = reference.trim();

  // "Book Chapter" (no verse) -> chapter-level passage, e.g. "Psalm 23" -> PSA.23
  const chapterOnly = trimmed.match(/^(.+?)\s+(\d+)$/);
  const verseMatch = trimmed.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);

  if (verseMatch) {
    const [, book, chapter, vStart, vEnd] = verseMatch;
    const code = BOOK_TO_USFM[book.trim().toLowerCase()];
    if (!code) throw new Error(`Unrecognized book name "${book}" in reference "${reference}"`);
    return vEnd ? `${code}.${chapter}.${vStart}-${vEnd}` : `${code}.${chapter}.${vStart}`;
  }
  if (chapterOnly) {
    const [, book, chapter] = chapterOnly;
    const code = BOOK_TO_USFM[book.trim().toLowerCase()];
    if (!code) throw new Error(`Unrecognized book name "${book}" in reference "${reference}"`);
    return `${code}.${chapter}`;
  }
  throw new Error(
    `Could not parse reference "${reference}" as "Book Chapter:Verse[-Verse]" or "Book Chapter" (cross-chapter ranges are not supported)`
  );
}
