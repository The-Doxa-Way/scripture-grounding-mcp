/**
 * GET/POST /api/passage {reference} — canonical BSB text for a Scripture
 * reference at any scale: verse range, whole chapter ("Romans 8"), chapter
 * range ("Romans 1-3"), cross-chapter range ("John 3:16-4:2"), or whole book
 * ("Romans").
 *
 * POLICY GATE: this route imports ONLY local public-domain corpora
 * (src/fixtures.js + src/bible.js), never src/youversion-client.js. The
 * YouVersion Platform API requires a per-developer, non-shareable App Key
 * (per YouVersion Platform's terms) — this public demo holds no server-side
 * YouVersion credential and must never proxy a personal key on a judge's/
 * GPT-user's behalf. The keyless BSB corpus is a first-class mode of the
 * underlying MCP server (see repo README), so serving it here is a
 * deliberate policy choice, not a degraded fallback: this deployment runs
 * entirely on public-domain text (the whole BSB, committed with provenance
 * in data/PROVENANCE.md).
 */
import { findByReference } from '../../src/fixtures.js';
import { parseHumanRef } from '../../src/usfm.js';
import { resolveRef, getBibleText } from '../../src/bible.js';
import { withGate, sendJson } from './_lib/http.js';

const REFERENCE_EXAMPLES = ['John 3:16-17', 'Psalm 23', 'Romans 8', 'Romans 1-3', 'John 3:16-4:2', 'Romans'];

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use GET ?reference=... or POST {reference}.' });
    return;
  }
  const reference = req.method === 'GET' ? req.query?.reference : req.body?.reference;
  if (!reference || typeof reference !== 'string' || !reference.trim()) {
    sendJson(res, 400, { error: 'Missing "reference". Provide a Scripture reference, e.g. "John 3:16-17".' });
    return;
  }
  // Curated fixture first (carries per-passage provenance URL); the
  // whole-Bible corpus covers everything else.
  const fixture = findByReference(reference);
  if (fixture) {
    sendJson(res, 200, {
      reference: fixture.reference,
      translation: fixture.translation,
      text: fixture.text,
      source: 'fixture',
      sourceUrl: fixture.source,
    });
    return;
  }
  try {
    const got = getBibleText(resolveRef(parseHumanRef(reference)));
    sendJson(res, 200, {
      reference: got.reference,
      translation: 'BSB (Berean Standard Bible, public domain)',
      text: got.text,
      source: 'bsb-corpus',
      sourceUrl: 'https://bereanbible.com/bsb.txt',
      chapterCount: got.chapterCount,
      ...(got.segments.length > 1 ? { segments: got.segments } : {}),
    });
  } catch (err) {
    sendJson(res, 404, {
      error: `"${reference}" could not be resolved: ${err.message}`,
      supportedFormats: REFERENCE_EXAMPLES,
    });
  }
}

export default withGate(handler);
