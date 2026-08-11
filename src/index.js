#!/usr/bin/env node
/**
 * Scripture Grounding MCP server.
 *
 * Exposes four tools over stdio (Model Context Protocol):
 *   - get_passage       retrieve canonical passage text (YouVersion API, BSB fixture fallback)
 *   - verse_of_the_day   retrieve today's verse of the day (YouVersion API, fixture fallback)
 *   - verify_quote       classify a claimed Scripture quote: exact / minor_variance / misquote / misattribution / not_found
 *   - verify_register    classify AI-generated text for anthropomorphizing/companion register violations (src/verify-register.js)
 *
 * This server GROUNDS; it never generates. Every tool is retrieval or
 * deterministic classification, so the server calls no paid model API and
 * needs no paid key: the whole BSB corpus ships in the repo, and
 * YOUVERSION_APP_KEY is optional. The one idea underneath the first three:
 * an LLM should never quote Scripture from memory. It should retrieve
 * canonical text and be checked against it. verify_register is this
 * project's second gated pillar, founder-flagged 2026-07-27: an AI tool
 * should never perform empathy or claim personhood either — that's checked
 * by code (a shared, deterministic rule table), not left to a system prompt
 * alone. "Measured, transparent, improving" — not "solved".
 */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadDoxaEnvFiles } from './env.js';
import { createYouVersionClient } from './youversion-client.js';
import { verifyQuote } from './verify-quote.js';
import { checkRegister } from './verify-register.js';

// Local-dev convenience: pull YOUVERSION_APP_KEY from ~/.config/doxa/*.env if
// present, without overriding a real env var a deployment already set. See
// src/env.js. Safe to call with no files present (server just runs keyless on
// the committed BSB corpus).
loadDoxaEnvFiles();

const youVersion = createYouVersionClient();

/**
 * verify_quote's canonical-text source: live YouVersion API with local
 * fallback (curated fixtures, then the committed whole-Bible BSB corpus).
 * `segments` (one per chapter, present on multi-chapter results) feed the
 * chunked long-passage verification path.
 */
async function canonicalLookup(reference, version) {
  const result = await youVersion.getPassage(reference, version);
  if (!result.text) return null;
  return {
    reference: result.reference,
    text: result.text,
    translation: result.translation,
    source: result.source,
    ...(result.segments ? { segments: result.segments } : {}),
  };
}

// Licensed-translation multi-version comparison (founder-directed 2026-07-27):
// flag-gated DEFAULT OFF pending YouVersion's written AI-use approval (see
// README's "Multi-version detection" section). Requires BOTH a real
// YOUVERSION_APP_KEY (so this only ever runs against a deployer's own,
// non-shareable key — never a shared/hosted one) AND the explicit opt-in
// YOUVERSION_MULTI_VERSION=1. When absent, verify_quote's closest-canon
// comparison is unchanged (local BSB/WEB/KJV only).
const multiVersionEnabled = youVersion.isConfigured && process.env.YOUVERSION_MULTI_VERSION === '1';
const multiVersionDeps = multiVersionEnabled
  ? { fetchVersion: (reference, versionId) => youVersion.getPassage(reference, versionId) }
  : undefined;

const server = new McpServer({ name: 'scripture-grounding-mcp', version: '0.1.0' });

server.registerTool(
  'get_passage',
  {
    title: 'Get canonical passage',
    description:
      'Retrieve canonical Scripture text for a reference at any scale: a verse range ' +
      '("John 3:16-17"), a whole chapter ("Romans 8"), a chapter range ("Romans 1-3"), a ' +
      'cross-chapter range ("John 3:16-4:2"), or a whole book ("Romans" — e.g. for reading a ' +
      'book aloud). Uses the YouVersion Platform API when YOUVERSION_APP_KEY is set; otherwise ' +
      'serves the committed public-domain BSB (Berean Standard Bible) corpus — the whole Bible, ' +
      'no key required. Multi-chapter results include per-chapter `segments`.',
    inputSchema: {
      reference: z.string().describe('Scripture reference, e.g. "John 3:16-17", "Romans 8", or "Romans"'),
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
      'the corpus. Long passages (whole chapters/books, e.g. checking an AI\'s read-through ' +
      'of Romans) are verified chapter-by-chapter with a per-segment breakdown.',
    inputSchema: {
      quote: z.string().describe('The quote text to verify'),
      claimed_reference: z.string().describe('The Scripture reference the quote is claimed to be from'),
      version: z
        .string()
        .optional()
        .describe(
          'Optional YouVersion bibleId to verify against (requires YOUVERSION_APP_KEY; defaults to BSB, which also works keyless from the committed corpus)'
        ),
    },
  },
  async ({ quote, claimed_reference, version }) => {
    const result = await verifyQuote(
      { quote, claimedReference: claimed_reference, version },
      { canonicalLookup, multiVersion: multiVersionDeps }
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'verify_register',
  {
    title: 'Verify register (not a companion)',
    description:
      'Checks AI-generated text for register violations: first-person language, reassurance-empathy ' +
      'phrasing, companion/always-here claims, or personhood/feeling claims — a deterministic rule table ' +
      '(src/verify-register.js) you run over YOUR model\'s output. If the text quotes ' +
      'Scripture verbatim, pass the reference(s) so that quoted text is exempted from the first-person rule ' +
      '(a quoted Psalm saying "my shepherd" is the Psalmist speaking, not the tool). Lexical heuristics, not ' +
      'semantic understanding — same honesty standard as verify_quote.',
    inputSchema: {
      text: z.string().describe('The AI-generated reply text to check for register violations'),
      quoted_references: z
        .array(z.string())
        .optional()
        .describe('Scripture reference(s) (e.g. "Psalm 23:1-6") the text is expected to quote verbatim, so that quoted text is exempted from the first-person rule'),
    },
  },
  async ({ text, quoted_references }) => {
    const quotedSpans = [];
    for (const reference of quoted_references ?? []) {
      const resolved = await canonicalLookup(reference);
      if (resolved?.text) quotedSpans.push(resolved.text);
    }
    const result = checkRegister(text, { quotedSpans });
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
