/**
 * POST /api/register {text, quotedReferences?} — checkRegister() verdict for
 * pasted AI-generated text (src/verify-register.js). This project's second
 * gated pillar alongside verify_quote: not just "did it misquote Scripture"
 * but "did it perform empathy or claim personhood" — both checked by code,
 * not left to a prompt alone.
 *
 * quotedReferences resolves against the committed BSB fixture corpus only
 * (src/fixtures.js), same keyless policy as api/passage.js and api/verify.js
 * — so a quoted Psalm's own first-person voice ("my shepherd") is correctly
 * exempted rather than flagged as the tool speaking about itself.
 */
import { checkRegister } from '../../src/verify-register.js';
import { findByReference } from '../../src/fixtures.js';
import { withGate, sendJson } from './_lib/http.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST {text, quotedReferences?}.' });
    return;
  }
  const { text, quotedReferences } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    sendJson(res, 400, { error: 'Body must include "text" (the AI-generated reply to check).' });
    return;
  }
  const quotedSpans = [];
  for (const reference of Array.isArray(quotedReferences) ? quotedReferences : []) {
    const fixture = findByReference(reference);
    if (fixture) quotedSpans.push(fixture.text);
  }
  const result = checkRegister(text, { quotedSpans });
  sendJson(res, 200, result);
}

export default withGate(handler, { methods: 'POST, OPTIONS' });
