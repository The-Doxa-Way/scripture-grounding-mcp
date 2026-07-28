/**
 * Client for the YouVersion Platform API (https://developers.youversion.com).
 *
 * Verified live on 2026-07-27 against a real App Key:
 *   - Auth header: `x-yvp-app-key: <key>` on every request.
 *   - Passage:  GET /bibles/{bibleId}/passages/{USFM-passage-id}
 *               e.g. /bibles/3034/passages/JHN.3.16-17
 *               -> {"id":"JHN.3.16-17","content":"...","reference":"John 3:16-17"}
 *               Verse ranges use USFM "BOOK.CHAPTER.VSTART-VEND" (same-chapter
 *               only — confirmed by live testing; "JHN.3.16-JHN.3.17" and other
 *               shapes 404). See src/usfm.js for the human-reference converter.
 *   - Verse of the day: GET /verse_of_the_days/{dayOfYear} (1-366)
 *               -> {"day":1,"passage_id":"ISA.43.18-19"} — a passage id only,
 *               so verseOfTheDay() makes a second call to resolve its text.
 *   - bibleId 3034 = BSB (Berean Standard Bible), confirmed live and used as
 *     the default so the keyless-vs-keyed modes agree on the same translation.
 *
 * When no key is configured (or a live request fails), every method falls
 * back to local public-domain text: the curated fixtures in
 * fixtures/bsb/*.json first, then the committed whole-Bible BSB corpus
 * (src/bible.js) — so the MCP tools remain fully functional offline / in CI
 * with zero setup, for ANY reference up to a whole book. That keyless BSB
 * mode is a first-class feature, not just a fallback: anyone can run this
 * server out of the box on public-domain text, and add a YOUVERSION_APP_KEY
 * (see README — register your own key per YouVersion Platform's terms, keys
 * are per-developer and non-shareable) to unlock the licensed library
 * (1,400+ versions) at runtime. Callers can inspect `result.source`
 * ("youversion-api" | "fixture" | "bsb-corpus") to know which path served
 * the response — this project never silently presents local text as a live
 * lookup.
 */
import { findByReference, loadFixtures } from './fixtures.js';
import { parseHumanRef } from './usfm.js';
import { resolveRef, getBibleText, verseCount, chapterCount } from './bible.js';

const YOUVERSION_BASE_URL = 'https://api.youversion.com/v1';
const APP_KEY_HEADER = 'x-yvp-app-key';
/** BSB, confirmed live 2026-07-27 (bible.com/versions/3034-bsb-...). */
const DEFAULT_BIBLE_ID = '3034';
/**
 * Cap on how many chapters a single multi-chapter request may fetch from the
 * live API (non-BSB versions only — BSB multi-chapter requests are served
 * from the committed corpus with zero API calls). Romans (16) fits; Psalms
 * (150) gets a clear error advising chapter-range requests instead of
 * silently hammering the API.
 */
const MAX_STITCH_CHAPTERS = 25;
const BSB_TRANSLATION_LABEL = 'BSB (Berean Standard Bible, public domain)';

/**
 * @param {{appKey?: string, fetchImpl?: typeof fetch}} [opts]
 */
export function createYouVersionClient(opts = {}) {
  const appKey = opts.appKey ?? process.env.YOUVERSION_APP_KEY;
  const doFetch = opts.fetchImpl ?? fetch;
  const isConfigured = Boolean(appKey);

  async function apiGet(pathname) {
    const res = await doFetch(`${YOUVERSION_BASE_URL}${pathname}`, {
      headers: { [APP_KEY_HEADER]: appKey },
    });
    if (!res.ok) throw new Error(`YouVersion API responded ${res.status} for ${pathname}`);
    return res.json();
  }

  /**
   * Parse + corpus-normalize a reference. Normalization (resolveRef) fixes
   * the single-chapter-book convention ("Jude 3" = Jude 1:3) and bounds-
   * checks against BSB versification; if bounds-checking rejects it (e.g. a
   * verse another translation has and BSB doesn't), the raw parse is kept so
   * a keyed API attempt can still be made.
   * @param {string} reference
   * @returns {{parsed: import('./usfm.js').ParsedRef, normalized: import('./usfm.js').ParsedRef|null}}
   */
  function parseReference(reference) {
    const parsed = parseHumanRef(reference);
    let normalized = null;
    try {
      normalized = resolveRef(parsed);
    } catch {
      normalized = null;
    }
    return { parsed, normalized };
  }

  /** Compose the single USFM passage id for a verse- or chapter-scope ref. */
  function usfmIdFor(ref) {
    if (ref.scope === 'verse') {
      return ref.verseEnd !== ref.verseStart
        ? `${ref.code}.${ref.chapter}.${ref.verseStart}-${ref.verseEnd}`
        : `${ref.code}.${ref.chapter}.${ref.verseStart}`;
    }
    return `${ref.code}.${ref.chapter}`;
  }

  /**
   * Fetch a passage by human reference. Handles every scope the parser
   * supports: verse ranges and chapters as a single lookup; whole books,
   * chapter ranges, and cross-chapter ranges ("read me Romans") as multiple
   * per-chapter segments.
   *
   * Multi-chapter behavior: with no key — or with the default BSB — the
   * committed whole-Bible BSB corpus serves the request locally
   * (source: 'bsb-corpus', zero API calls, byte-identical translation).
   * With a key AND a non-BSB version, per-chapter API calls are stitched
   * (capped at MAX_STITCH_CHAPTERS); partial first/last chapters use BSB
   * versification for their verse bounds — a documented approximation.
   *
   * @param {string} reference
   * @param {string} [version] - YouVersion bibleId; defaults to BSB (3034)
   * @returns {Promise<{reference: string, text: string|null, translation: string|null, source: 'youversion-api'|'fixture'|'bsb-corpus', superscription?: string, segments?: Array<{reference: string, text: string, superscription?: string}>, chapterCount?: number, note?: string, error?: string}>}
   */
  async function getPassage(reference, version) {
    let parsed;
    let normalized;
    try {
      ({ parsed, normalized } = parseReference(reference));
    } catch (err) {
      // Unparseable reference: preserve the historical fixture-mode error
      // shape (fixture lookup by raw string, then a clear error).
      return getPassageFromLocal(reference, null, err, undefined, { parseFailure: true });
    }
    const ref = normalized ?? parsed;
    const isMultiChapter = ref.scope === 'book' || ref.scope === 'chapter-range' || ref.scope === 'cross-chapter';
    const bibleId = version || process.env.YOUVERSION_DEFAULT_BIBLE_ID || DEFAULT_BIBLE_ID;

    if (isConfigured && !isMultiChapter) {
      try {
        const data = await apiGet(`/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(usfmIdFor(ref))}`);
        return {
          reference: data.reference ?? reference,
          text: data.content ?? '',
          translation: bibleId === DEFAULT_BIBLE_ID ? BSB_TRANSLATION_LABEL : String(bibleId),
          source: 'youversion-api',
        };
      } catch (err) {
        return getPassageFromLocal(reference, normalized, err);
      }
    }

    if (isConfigured && isMultiChapter && bibleId !== DEFAULT_BIBLE_ID) {
      return stitchedApiPassage(reference, ref, bibleId);
    }

    // Keyless (any scope), or keyed multi-chapter BSB (identical to the
    // committed corpus — served locally rather than spending 16-150 calls).
    return getPassageFromLocal(
      reference,
      normalized,
      null,
      isConfigured && isMultiChapter
        ? 'Multi-chapter BSB requests are served from the committed BSB corpus (byte-identical translation, zero API calls).'
        : undefined
    );
  }

  /**
   * Stitch a multi-chapter passage from per-chapter live API calls (non-BSB
   * versions only). Fails loud on any chapter failure — never silently
   * substitutes BSB text for a different requested translation.
   */
  async function stitchedApiPassage(reference, ref, bibleId) {
    const first = ref.scope === 'book' ? 1 : ref.chapter;
    // Chapter count comes from the BSB corpus (shared versification at chapter level).
    const last = ref.scope === 'book' ? chapterCount(ref.code) : ref.endChapter;
    const total = last - first + 1;
    if (total > MAX_STITCH_CHAPTERS) {
      return {
        reference,
        text: null,
        translation: String(bibleId),
        source: 'youversion-api',
        error:
          `"${reference}" spans ${total} chapters — more than the ${MAX_STITCH_CHAPTERS}-chapter cap for live ` +
          'per-chapter stitching against a non-BSB version. Request it in chapter ranges instead ' +
          '(or use the default BSB, which is served from the local corpus without API calls).',
      };
    }
    const segments = [];
    for (let c = first; c <= last; c++) {
      let id = `${ref.code}.${c}`;
      if (ref.scope === 'cross-chapter' && c === first && ref.verseStart > 1) {
        id = `${ref.code}.${c}.${ref.verseStart}-${verseCount(ref.code, c)}`;
      } else if (ref.scope === 'cross-chapter' && c === last) {
        id = `${ref.code}.${c}.1-${ref.endVerse}`;
      }
      try {
        const data = await apiGet(`/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(id)}`);
        segments.push({ reference: data.reference ?? id, text: data.content ?? '' });
      } catch (err) {
        return {
          reference,
          text: null,
          translation: String(bibleId),
          source: 'youversion-api',
          error: `Chapter fetch failed at ${id} for version ${bibleId} (${err.message}) — refusing to return a partial ${reference}.`,
        };
      }
    }
    return {
      reference,
      text: segments.map((s) => s.text).join('\n\n'),
      translation: String(bibleId),
      source: 'youversion-api',
      segments,
      chapterCount: segments.length,
      note: `Stitched from ${segments.length} per-chapter YouVersion API calls; partial-chapter verse bounds use BSB versification.`,
    };
  }

  /**
   * Local text: the curated fixture corpus first (exact reference match —
   * carries genre + per-passage provenance), then the committed whole-Bible
   * BSB corpus for everything else.
   */
  function getPassageFromLocal(reference, normalized, cause, note, { parseFailure = false } = {}) {
    const fixture = findByReference(reference);
    if (fixture) {
      return {
        reference: fixture.reference,
        text: fixture.text,
        translation: fixture.translation,
        source: 'fixture',
        // A psalm's superscription (musical/liturgical heading) is split out
        // of `text` at fixture-build time (src/superscription.js) — exposed
        // here separately, never silently dropped, for callers that want to
        // display or reason about it.
        ...(fixture.superscription ? { superscription: fixture.superscription } : {}),
        ...(cause ? { note: `YouVersion API call failed (${cause.message}); served from fixture instead.` } : {}),
        ...(!cause && note ? { note } : {}),
      };
    }
    if (normalized) {
      try {
        const got = getBibleText(normalized);
        const single = got.segments.length === 1 ? got.segments[0] : null;
        return {
          reference: got.reference,
          text: got.text,
          translation: BSB_TRANSLATION_LABEL,
          source: 'bsb-corpus',
          segments: got.segments,
          chapterCount: got.chapterCount,
          ...(single?.superscription ? { superscription: single.superscription } : {}),
          ...(cause ? { note: `YouVersion API call failed (${cause.message}); served from the committed BSB corpus instead.` } : {}),
          ...(!cause && note ? { note } : {}),
        };
      } catch {
        // fall through to the error shape below
      }
    }
    return {
      reference,
      text: null,
      translation: null,
      source: 'fixture',
      error:
        cause && parseFailure
          ? `"${reference}" could not be resolved (${cause.message}) and matched neither the fixture corpus nor the committed BSB corpus.`
          : cause
            ? `YouVersion API unavailable (${cause.message}) and "${reference}" matched neither the fixture corpus nor the committed BSB corpus.`
            : `"${reference}" could not be resolved against the fixture corpus or the committed BSB corpus` +
              (isConfigured ? '.' : ' (keyless mode: no YOUVERSION_APP_KEY set).'),
    };
  }

  /**
   * Fetch the Verse of the Day: resolves today's (or a given day-of-year's)
   * passage id via GET /verse_of_the_days/{day}, then resolves that passage
   * id's text via getPassage.
   * @param {{date?: Date}} [opts2]
   * @returns {Promise<{reference: string, text: string, translation: string, source: 'youversion-api'|'fixture'}>}
   */
  async function verseOfTheDay(opts2 = {}) {
    if (isConfigured) {
      try {
        const date = opts2.date ?? new Date();
        const dayOfYear = Math.ceil(
          (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
            Date.UTC(date.getUTCFullYear(), 0, 0)) /
            86400000
        );
        const votd = await apiGet(`/verse_of_the_days/${dayOfYear}`);
        const bibleId = process.env.YOUVERSION_DEFAULT_BIBLE_ID || DEFAULT_BIBLE_ID;
        const data = await apiGet(`/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(votd.passage_id)}`);
        return {
          reference: data.reference ?? votd.passage_id,
          text: data.content ?? '',
          translation: bibleId === DEFAULT_BIBLE_ID ? 'BSB (Berean Standard Bible, public domain)' : String(bibleId),
          source: 'youversion-api',
        };
      } catch (err) {
        return votdFromFixture(err);
      }
    }
    return votdFromFixture();
  }

  function votdFromFixture(cause) {
    // No real VOTD calendar in fixture mode; deterministically rotate through
    // the committed fixture set by day-of-year so the tool is exercisable
    // offline without ever fabricating text.
    const fixtures = loadFixtures();
    if (fixtures.length === 0) {
      return {
        reference: null,
        text: null,
        translation: null,
        source: 'fixture',
        error: cause
          ? `YouVersion API unavailable (${cause.message}) and no fixtures are loaded`
          : 'No fixtures loaded (fixture mode: no YOUVERSION_APP_KEY set)',
      };
    }
    const now = new Date();
    const dayOfYear = Math.ceil(
      (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        Date.UTC(now.getUTCFullYear(), 0, 0)) /
        86400000
    );
    const fixture = fixtures[dayOfYear % fixtures.length];
    return {
      reference: fixture.reference,
      text: fixture.text,
      translation: fixture.translation,
      source: 'fixture',
      note: 'Deterministic fixture-set rotation, not a real VOTD calendar (fixture mode).',
    };
  }

  return { getPassage, verseOfTheDay, isConfigured };
}
