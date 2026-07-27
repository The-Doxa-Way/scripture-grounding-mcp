/**
 * GET/POST /api/passage {reference} — BSB fixture text for a Scripture reference.
 *
 * POLICY GATE: this route imports ONLY src/fixtures.js, never
 * src/youversion-client.js. The YouVersion Platform API requires a
 * per-developer, non-shareable App Key (per YouVersion Platform's terms) —
 * this public demo holds no server-side YouVersion credential and must never
 * proxy a personal key on a judge's/GPT-user's behalf. The keyless BSB
 * fixture corpus is a first-class mode of the underlying MCP server (see
 * repo README), so serving it here is a deliberate policy choice, not a
 * degraded fallback: this deployment runs entirely on public-domain text.
 */
import { findByReference, loadFixtures } from '../../src/fixtures.js';
import { withGate, sendJson } from './_lib/http.js';

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
  const fixture = findByReference(reference);
  if (!fixture) {
    sendJson(res, 404, {
      error: `"${reference}" is not in this demo's fixture corpus.`,
      availableReferences: loadFixtures()
        .map((f) => f.reference)
        .sort(),
    });
    return;
  }
  sendJson(res, 200, {
    reference: fixture.reference,
    translation: fixture.translation,
    text: fixture.text,
    source: 'fixture',
    sourceUrl: fixture.source,
  });
}

export default withGate(handler);
