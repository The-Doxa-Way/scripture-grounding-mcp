# Roadmap

What this project ships today, and the backlog we intend to build next, in
public, in this repo. Items are ordered by intent. No dates are promised. The
governing rule for everything below is the project's one idea, **the model
never quotes from memory**, and its honesty bar: named limitations, measured
claims, no capability theater.

## Shipped (built inside the challenge window)

- MCP server with four tools: `get_passage`, `verse_of_the_day`,
  `verify_quote`, `verify_register`. All retrieval or deterministic checks —
  the server calls no model provider and needs no paid key.
- Keyless whole-Bible corpus: the complete public-domain Berean Standard
  Bible, committed with provenance (`data/PROVENANCE.md`): any reference
  from a single verse to a whole book ("Romans"), no API key required.
- Long-passage verification: chapter-by-chapter chunked diffing with
  per-segment breakdown, omitted-chapter detection, and word-for-word
  "exact" semantics at any length, so "an AI read Romans aloud; was it
  word-perfect?" is a checkable question.
- Benchmark: 34 passages × 3 conditions against a live hosted model, run
  2026-07-27 (67.6% exact ungrounded vs 100% grounded). Results committed;
  see benchmark/METHODOLOGY.md to reproduce with a provider of your own.
- Register guard: deterministic anti-companion rule table, exposed as
  `verify_register` for callers to run over their own model's output.
- ChatGPT custom-GPT integration (REST Actions backend + instructions),
  live demo at doxa.app/scripture-grounding, safety evals with a
  human-review trail.

## Next: pending YouVersion's written AI-use approval

The licensed multi-version path is **already implemented behind a flag**
(`YOUVERSION_MULTI_VERSION=1` plus your own App Key; see README): cross-checking
a quote against licensed translations so "accurate NIV quote, wrong
translation requested" is distinguished from "misquote." It ships default-off
because YouVersion Platform's terms require written approval for production
AI use. The approval request is drafted; the feature turns on the day the
letter arrives. Bible text stays free wherever this project touches users.
That is a permanent commitment.

## Near-term engineering backlog

1. **Read-aloud / audio frontier**: a `read_book` orchestration guide +
   examples for voice assistants: sequential chapter retrieval with
   `verify_quote` run on the transcript afterward, so spoken Scripture can be
   audited word-for-word against canon. (The retrieval and verification
   primitives shipped in-window; this item is the integration recipe and
   reference client.)
2. **Whole-Bible misattribution search**: today `verify_quote`'s
   misattribution check searches the 34-passage curated corpus; extend it to
   all 31,102 verses with a bag-of-words prefilter + windowed LCS, so "real
   verse, wrong reference" is caught corpus-wide. Requires careful synoptic-
   parallel handling (Matthew/Mark/Luke share near-identical passages); the
   margin-over-claimed-reference rule already guards against false flags, but
   we will measure before we ship.
3. **Reading plans / VOTD calendars**: thin structured endpoints over the
   corpus (books, chapter counts, canonical orders) so plan-building agents
   don't hand-roll Bible structure.
4. **Semantic register guard**: today's `verify_register` is a deterministic
   lexical rule table (disclosed as such). Explore a model-graded second
   opinion, kept clearly separated from the deterministic layer and never
   replacing it. A guard you can't audit is a guard you can't trust.
5. **More public-domain corpora**: WEB and KJV are shipped for
   cross-translation detection at passage scale; extend both to whole-Bible
   scale, and add public-domain non-English texts (e.g. Reina-Valera 1909)
   as a first step toward the 1,244-language vision without licensing walls.
6. **MCP resources**: expose chapters/books as MCP resources (not just
   tools), so clients can browse canon structure natively.

## Frontier integrations (the challenge's own list)

- **Games / interactive media**: `verify_quote` as a content-pipeline CI
  step: every Scripture string in game assets checked against canon at
  build time.
- **Wearables / voice**: the read-aloud recipe above, plus VOTD push.
- **Social / creator tools**: a "check this quote" share-card generator on
  the demo site, using the existing verdict + diff output.

## Measurement backlog

- Re-run the benchmark across more models as new ones land, and publish
  deltas. This needs a model caller, which this repo deliberately no longer
  ships — so it runs on a contributor's own key, never on a hosted one.
- Expand the corpus beyond 34 passages (stratified by genre) and publish
  updated exact-quote rates.
- Long-passage benchmark: seeded-error book reads (N errors per 1,000 words)
  scored by segment attribution accuracy. This measures the chunked verifier
  itself as well as the models.

## Doxa

We build [Doxa](https://doxa.app), the prophetic encouragement app. This
server is our conviction about Scripture fidelity, open-sourced; lessons from
it flow into Doxa, and lessons from Doxa's safety evals flowed into it. The
closed parts of Doxa (its encouragement prompt) stay closed; everything this
repo needs stays open.
