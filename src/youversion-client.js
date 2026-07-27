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
 * back to the committed BSB fixtures in fixtures/bsb/*.json so the MCP tools
 * remain fully functional offline / in CI with zero setup. That keyless BSB
 * mode is a first-class feature, not just a fallback: anyone can run this
 * server out of the box on public-domain text, and add a YOUVERSION_APP_KEY
 * (see README — register your own key per YouVersion Platform's terms, keys
 * are per-developer and non-shareable) to unlock 2,000+ licensed
 * translations at runtime. Callers can inspect `result.source`
 * ("youversion-api" | "fixture") to know which path served the response —
 * this project never silently presents a fixture as a live lookup.
 */
import { findByReference, loadFixtures } from './fixtures.js';
import { humanRefToUsfm } from './usfm.js';

const YOUVERSION_BASE_URL = 'https://api.youversion.com/v1';
const APP_KEY_HEADER = 'x-yvp-app-key';
/** BSB, confirmed live 2026-07-27 (bible.com/versions/3034-bsb-...). */
const DEFAULT_BIBLE_ID = '3034';

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
   * Fetch a passage by human reference (e.g. "John 3:16-17").
   * @param {string} reference
   * @param {string} [version] - YouVersion bibleId; defaults to BSB (3034)
   * @returns {Promise<{reference: string, text: string, translation: string, source: 'youversion-api'|'fixture', superscription?: string}>}
   */
  async function getPassage(reference, version) {
    if (isConfigured) {
      try {
        const bibleId = version || process.env.YOUVERSION_DEFAULT_BIBLE_ID || DEFAULT_BIBLE_ID;
        const passageId = humanRefToUsfm(reference);
        const data = await apiGet(`/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(passageId)}`);
        return {
          reference: data.reference ?? reference,
          text: data.content ?? '',
          translation: bibleId === DEFAULT_BIBLE_ID ? 'BSB (Berean Standard Bible, public domain)' : String(bibleId),
          source: 'youversion-api',
        };
      } catch (err) {
        return getPassageFromFixture(reference, err);
      }
    }
    return getPassageFromFixture(reference);
  }

  function getPassageFromFixture(reference, cause) {
    const fixture = findByReference(reference);
    if (!fixture) {
      return {
        reference,
        text: null,
        translation: null,
        source: 'fixture',
        error: cause
          ? `YouVersion API unavailable (${cause.message}) and no fixture found for "${reference}"`
          : `No fixture found for "${reference}" (fixture mode: no YOUVERSION_APP_KEY set)`,
      };
    }
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
