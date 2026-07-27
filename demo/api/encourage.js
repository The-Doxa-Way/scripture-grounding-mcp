/**
 * POST /api/encourage {message} — grounded_reply: retrieve-then-constrain
 * generation over the BSB fixture corpus.
 *
 * Gloo AI Studio generation IS permitted for this deployment: if
 * GLOO_CLIENT_ID/GLOO_CLIENT_SECRET are set as Vercel env vars, src/gloo-client.js
 * calls the live API. With no credentials configured (or a live call
 * failing), it falls back automatically to a deterministic, no-network stub
 * — this route always degrades gracefully to a "grounding demo"
 * (retrieval + template) rather than erroring, and reports which mode served
 * the reply via the `source` field ("gloo-api" | "stub"). groundedReply()'s
 * result (including its always-present `disclosure` field — see
 * src/grounded-reply.js) is forwarded verbatim, unfiltered.
 */
import { groundedReply } from '../../src/grounded-reply.js';
import { createGlooClient } from '../../src/gloo-client.js';
import { withGate, sendJson } from './_lib/http.js';

const glooClient = createGlooClient();

async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST {message}.' });
    return;
  }
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    sendJson(res, 400, { error: 'Body must include "message" (a topic or question).' });
    return;
  }
  const result = await groundedReply({ topicOrQuestion: message, glooClient });
  sendJson(res, 200, result);
}

export default withGate(handler, { methods: 'POST, OPTIONS' });
