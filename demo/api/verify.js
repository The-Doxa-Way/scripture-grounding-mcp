/**
 * POST /api/verify {quote, reference} — the full verify_quote verdict object.
 *
 * Calls src/verify-quote.js with no injected `canonicalLookup`, so it uses
 * that module's own default: the committed BSB fixture corpus
 * (src/fixtures.js), never the YouVersion API — same keyless policy as
 * api/passage.js.
 */
import { verifyQuote } from '../../src/verify-quote.js';
import { withGate, sendJson } from './_lib/http.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST {quote, reference}.' });
    return;
  }
  const { quote, reference } = req.body || {};
  if (!quote || !reference) {
    sendJson(res, 400, { error: 'Body must include both "quote" and "reference".' });
    return;
  }
  const result = await verifyQuote({ quote, claimedReference: reference });
  sendJson(res, 200, result);
}

export default withGate(handler, { methods: 'POST, OPTIONS' });
