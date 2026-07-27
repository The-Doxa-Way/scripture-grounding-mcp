#!/usr/bin/env node
/**
 * Scripture Grounding MCP server.
 *
 * Exposes four tools over stdio (Model Context Protocol):
 *   - get_passage       retrieve canonical passage text (YouVersion API, BSB fixture fallback)
 *   - verse_of_the_day   retrieve today's verse of the day (YouVersion API, fixture fallback)
 *   - verify_quote       classify a claimed Scripture quote: exact / minor_variance / misquote / misattribution / not_found
 *   - grounded_reply     demonstrate retrieve-then-constrain generation via Gloo AI Studio
 *
 * The one idea underneath all four: an LLM should never quote Scripture
 * from memory. It should retrieve canonical text and be checked against it.
 * "Measured, transparent, improving" — not "solved".
 */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadDoxaEnvFiles } from './env.js';
import { createYouVersionClient } from './youversion-client.js';
import { createGlooClient } from './gloo-client.js';
import { verifyQuote } from './verify-quote.js';
import { groundedReply } from './grounded-reply.js';

// Local-dev convenience: pull YOUVERSION_APP_KEY / GLOO_CLIENT_ID / GLOO_CLIENT_SECRET
// from ~/.config/doxa/*.env if present, without overriding real env vars a
// deployment already set. See src/env.js. Safe to call with no files present
// (server just runs keyless on BSB fixtures / stub mode).
loadDoxaEnvFiles();

const youVersion = createYouVersionClient();
const gloo = createGlooClient();

/** verify_quote's canonical-text source: live YouVersion API with BSB-fixture fallback. */
async function canonicalLookup(reference, version) {
  const result = await youVersion.getPassage(reference, version);
  if (!result.text) return null;
  return { reference: result.reference, text: result.text, translation: result.translation, source: result.source };
}

const server = new McpServer({ name: 'scripture-grounding-mcp', version: '0.1.0' });

server.registerTool(
  'get_passage',
  {
    title: 'Get canonical passage',
    description:
      'Retrieve canonical Scripture text for a reference (e.g. "John 3:16-17"). ' +
      'Uses the YouVersion Platform API when YOUVERSION_APP_KEY is set; otherwise ' +
      'falls back to the committed public-domain BSB (Berean Standard Bible) fixture ' +
      'corpus, which requires no key at all.',
    inputSchema: {
      reference: z.string().describe('Scripture reference, e.g. "John 3:16-17" or "Psalm 23"'),
      version: z
        .string()
        .optional()
        .describe('Optional Bible version/translation id (YouVersion bibleId). Defaults to BSB in fixture mode.'),
    },
  },
  async ({ reference, version }) => {
    const result = await youVersion.getPassage(reference, version);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'verse_of_the_day',
  {
    title: 'Verse of the day',
    description:
      'Retrieve the Verse of the Day. Uses the YouVersion Platform API when ' +
      'YOUVERSION_APP_KEY is set; otherwise deterministically rotates through the ' +
      'committed BSB fixture corpus (clearly marked as fixture-mode, never presented ' +
      'as a real VOTD calendar).',
    inputSchema: {},
  },
  async () => {
    const result = await youVersion.verseOfTheDay();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'verify_quote',
  {
    title: 'Verify a Scripture quote',
    description:
      'The core grounding tool. Given a quote and the reference it is claimed to be ' +
      'from, fetch the canonical text and classify the quote as exact, minor_variance ' +
      '(>0.95 word-level similarity), misquote (diverges materially), misattribution ' +
      '(the quote actually matches a DIFFERENT passage in the corpus better than its ' +
      'claimed reference), or not_found (reference or match not available). Returns the ' +
      'verdict, canonical text, a word-level diff summary, and a similarity score — this ' +
      'never asserts the quote is correct from memory, only what could be verified against ' +
      'the corpus.',
    inputSchema: {
      quote: z.string().describe('The quote text to verify'),
      claimed_reference: z.string().describe('The Scripture reference the quote is claimed to be from'),
      version: z.string().optional().describe('Optional Bible version/translation id (currently informational; fixture corpus is BSB)'),
    },
  },
  async ({ quote, claimed_reference, version }) => {
    const result = await verifyQuote({ quote, claimedReference: claimed_reference, version }, { canonicalLookup });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'grounded_reply',
  {
    title: 'Grounded reply',
    description:
      'Demonstrates the grounding pattern end-to-end: retrieve a relevant canonical ' +
      'passage for a topic/question FIRST (from the BSB fixture corpus via a keyword ' +
      'map), then generate a reply via Gloo AI Studio constrained by a system prompt ' +
      'that requires quoting only that passage, verbatim, with its reference cited. ' +
      'Runs in a deterministic stub mode with no external call when GLOO_CLIENT_ID/GLOO_CLIENT_SECRET are unset.',
    inputSchema: {
      topic_or_question: z.string().describe('A topic or question to respond to, grounded in Scripture'),
    },
  },
  async ({ topic_or_question }) => {
    const result = await groundedReply({ topicOrQuestion: topic_or_question, glooClient: gloo });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('scripture-grounding-mcp: listening on stdio');
}

main().catch((err) => {
  console.error('scripture-grounding-mcp: fatal error', err);
  process.exit(1);
});
