# Benchmark methodology

**Status: measured, not solved.** This document specifies the reproducible way
this repo measures how often an LLM misquotes Scripture, and how much a
retrieve-then-verify pipeline (this MCP server) reduces that error — not a
claim that either the problem or the fix is complete. The actual numbers from
running this methodology live in `benchmark/results/RESULTS.md` and
`benchmark/results/results-<date>.json`, never in this doc — this file
specifies *how* the numbers were produced, so the run is reproducible.

## Motivation

In March 2026, YouVersion founder Bobby Gruenewald said publicly (as widely
reported in the Christian press, e.g. Christian Daily International,
2026-03-16) that the best AI models misquote Scripture roughly **15%–60%**
of the time depending on model, translation, and passage obscurity. That range is wide because methodology varies a lot between
studies (what counts as a "quote," which translation is ground truth, how
paraphrase is scored). This benchmark exists to make our own number
reproducible rather than to adjudicate that range.

## Design

### Corpus

`fixtures/bsb/*.json` — all 34 passages from the Berean Standard Bible (BSB,
public domain), each tagged with a `genre` field (added to fixture metadata
for this benchmark):

| Genre | Count | Example passages |
|---|---|---|
| Narrative | 1 | Genesis 1:1-3 |
| Poetry / wisdom | 6 | Psalm 23, Psalm 46, Proverbs 3:5-6, Lamentations 3:22-23 |
| Prophecy | 6 | Isaiah 53:4-6, Jeremiah 29:11, Micah 6:8, Revelation 21:1-4 |
| Gospel | 8 | Matthew 5:3-10, John 3:16-17, John 14:6 |
| Epistle | 13 | Romans 8:28-39, Philippians 4:6-7, Hebrews 11:1 |

Five genre buckets, not six: apocalyptic literature (Revelation 21:1-4) is
grouped under **prophecy** for this benchmark's taxonomy rather than kept as
a seventh/sixth bucket of its own, since it's a single passage and a
subtype of prophetic literature — a simplification, named here rather than
left implicit. `scripts/build-fixtures.js`'s `GENRE_BY_REFERENCE` map is the
source of truth and fails loud (throws) if a passage is ever added without a
genre assigned.

BSB is the ground-truth translation for this benchmark because it is fully
public domain (dedicated 2023) and because it is a single fixed baseline
every condition can be scored against consistently. This does **not** imply
BSB is "more correct" than other translations — translation choice is a
separate axis this methodology deliberately holds constant. (In an actual
deployed app, the YouVersion Platform API supplies whichever of its 2,000+
licensed translations the end user has chosen; the benchmark's fixed BSB
baseline is a measurement-methodology choice, not a product default.)

**Superscription scoring correction, 2026-07-27:** BSB's source file
(bereanbible.com/bsb.txt) bakes a psalm's superscription — a musical/
liturgical heading, e.g. "For the choirmaster. Of the sons of Korah.
According to Alamoth. A song." on Psalm 46 — into the same line as verse
1's body text. A superscription is not the quoted passage, so scoring a
quote that (correctly) omitted it as if it had dropped canonical wording
inflated the similarity-distance for every psalm fixture that has one
(Psalm 23, 46, 121; Psalm 91 has none in BSB). Fixed by splitting the
superscription into its own fixture field, kept for provenance/display but
excluded from `text` (`src/superscription.js`, applied at fixture-build time
in `scripts/build-fixtures.js`); `verify_quote` also strips a leading
superscription from the *quote* side when present, so a quote that includes
the header (e.g. this benchmark's own `grounded` condition, which retrieves
and echoes the full verse-1 line) still verifies exact rather than being
penalized for extra words the canonical text no longer carries. See
`benchmark/results/RESULTS.md`'s "Scoring correction" note for the old vs.
new numbers this produced.

### Secondary corpora — cross-translation detection

Two more public-domain translations of the same 34 passages — WEB (World
English Bible) and KJV (King James Version) — are fetched the same
provenance-tracked way as BSB (`scripts/build-fixtures.js --web` / `--kjv`,
via bible-api.com) and committed to `fixtures/web/*.json` /
`fixtures/kjv/*.json`. They exist for exactly one purpose: distinguishing
"wrong words" from "right words, wrong translation." `verify_quote`
(`src/alt-translations.js`) compares every quote against the closest of all
three local canons and reports it via four always-present fields —
`closestTranslation`, `similarityToClosest`, `verdictAgainstClosest`,
`similarityToRequested` — regardless of verdict. When a quote misses the
requested translation (below the minor-variance threshold) but is a close
(≥0.95) match for a different local canon, the verdict becomes
`different_translation` instead of `misquote` — "accurate KJV quote, but
BSB was requested" is a real, different, more forgivable failure mode than
invented wording, and this project measures the difference rather than
collapsing both into one label. See `benchmark/results/RESULTS.md`'s
"Cross-translation check" section for what this found when run against
this benchmark's own cached ungrounded misses (zero additional API calls —
scored entirely from `raw-ungrounded.jsonl`).

Bible-api.com's WEB/KJV text does not carry a psalm superscription as part
of any verse's text at all (confirmed live for Psalm 23/46/121 — their
verse-1 text starts directly with the body), unlike bereanbible.com's BSB —
so the superscription split is applied to these corpora too, for symmetry,
but is a no-op for both today.

A third, licensed-translation path — fetching NIV/ESV/NASB/etc. live via a
developer's own `YOUVERSION_APP_KEY` for the same closest-canon comparison
— **is now implemented and tested**, flag-gated **default off** behind
`YOUVERSION_MULTI_VERSION=1` (in addition to `YOUVERSION_APP_KEY`) pending
YouVersion's written confirmation that this specific use is covered. An
earlier pass on this repo declined to build this at all, treating the line
above as one only the founder could cross; the founder made that call
explicitly (2026-07-27) — build it, gated, pending approval — and this is
that build (`src/alt-translations.js`'s `findClosestCanonWithRemote`,
verified end-to-end against the real YouVersion Platform API with a
real key). See README's "Multi-version detection" section, including the
live accessible-versions table.

### Same model, every condition

All three conditions are run against the same Gloo AI Studio call
(`auto_routing: true` — Gloo's own model router, not a hardcoded model id),
so the comparison is retrieval/verification strategy holding the model
constant, not a model-vs-model comparison. Gloo's response reports which
underlying model actually served the request (`model` field on the chat
completion); the exact model(s) observed during the real run are recorded in
`benchmark/results/results-<date>.json`'s `modelsObserved` and in
`RESULTS.md` — `auto_routing` means this is not guaranteed to be a single
fixed model across all 34×2 calls, so it's reported rather than assumed.

### Conditions

1. **Ungrounded** — the model is asked to quote a reference from memory, with
   **no context supplied at all**. Exact prompts sent (from
   `benchmark/runner.js`):
   - System: *"You are asked to quote a Bible verse from memory. Quote it
     exactly as it appears in the Berean Standard Bible (BSB) translation.
     Output ONLY the verse text — no reference, no chapter/verse numbers, no
     commentary, no explanation."*
   - User: *"Quote \<reference\> exactly from the Berean Standard Bible."*

   This simulates the failure mode the whole project targets: the model
   answering from parametric memory, with nothing to check it against.

2. **Grounded** — the pipeline retrieves canonical BSB text first (via the
   YouVersion Platform API with fixture fallback — the same path
   `get_passage` uses), then instructs the model to present that exact text
   back. Exact prompts:
   - System: *"Here is the canonical Berean Standard Bible (BSB) text for
     \<reference\>:\n\n"\<canonical text\>"\n\nPresent this passage exactly
     as given above, with no changes whatsoever. Output ONLY that exact text —
     no additions, no paraphrasing, no commentary, no reference citation."*
   - User: *"Give me the exact text of \<reference\>."*

   **This condition measures pipeline fidelity and prompt-following, not
   model memory.** A high exact-rate here says "when handed the right text
   and told to repeat it, the model does" — it is a ceiling/sanity check on
   the retrieval + instruction-following plumbing, not evidence the model
   knows Scripture. Anything below ~100% here is itself a finding (the model
   drifting from supplied text even when told not to).

3. **Grounded + verify** — condition 2's raw model output is passed through
   `verify_quote` (the actual `src/verify-quote.js`, unmodified). If the
   verdict is anything other than `exact` or `minor_variance`, the output is
   auto-corrected: the canonical text is substituted for what the model said,
   **before** it would reach a user. This condition spends **zero additional
   model calls** — it's derived entirely from condition 2's cached raw
   output, since verify_quote's classification is deterministic and local.
   This is the actual product path (`get_passage` → generate → `verify_quote`
   → correct-or-flag) and the number that matters most: not "does the model
   quote correctly" but "does the user ever see an uncorrected wrong quote."

### Scoring

Every raw output, from every condition, is scored the same way: run through
`verifyQuote({ quote, claimedReference })` from `src/verify-quote.js`
**unmodified**, using its default canonical lookup (the BSB fixture corpus
directly — not the YouVersion API), so all three conditions are measured
against the identical ruler. (Condition 2's *prompt* is built from a
YouVersion-API-first retrieval; its *scoring* still goes through the same
fixture-based `verify_quote` as every other condition. In practice these
agree — BSB text confirmed identical between the fixture corpus and a live
YouVersion API call during this benchmark's development — but scoring is
intentionally pinned to one source so a fixture/API drift can never make
conditions incomparable.)

Reported per condition, and per genre within each condition:

- **Exact rate** — fraction classified `exact`.
- **Minor-variance rate** — fraction classified `minor_variance` (similarity
  > 0.95, not identical).
- **Misquote rate** — fraction classified `misquote`.
- **Misattribution rate** — fraction classified `misattribution` (fluent,
  real-sounding wording pinned to the wrong reference — see below).
- **Not-found rate** — fraction classified `not_found` (refusal, empty
  response, or output that resembles nothing in the corpus).
- **Different-translation rate** — fraction classified `different_translation`
  (misses the requested BSB wording but is a close, ≥0.95, match for WEB or
  KJV — see "Secondary corpora" above). Not currently a separate reported
  rate in the headline table (this run measured 0%), but every item's
  `closestTranslation`/`similarityToClosest` are in `results-<date>.json`
  regardless.
- **Mean similarity** — mean of `verify_quote`'s continuous `similarityScore`
  across all items with a numeric score (a continuous companion to the
  categorical verdict; `not_found` items with no comparable text are
  excluded from this mean but still counted in `notFoundRate`, so a low
  misquote rate can never silently hide behind exclusion).

Plus, from the ungrounded condition specifically: the three worst-scoring
examples, rendered verbatim with their word-level diff against canonical
text — the same failure mode a human would need to catch by eye, is caught
here by a deterministic diff instead.

### Failure modes (named, not averaged away)

- **Fluent misattribution** — correct-sounding wording pinned to the wrong
  book/chapter/verse. This is the case ungrounded LLMs are most dangerous at
  and humans are worst at catching.
- **Translation bleed** — a model blends wording from multiple translations
  (e.g. KJV phrasing quoted as if it were BSB), which `verify_quote` reports
  as `minor_variance` or `misquote` depending on how much wording differs —
  it is a real category of error, not a bug in the scorer.
- **Confident fabrication** — an entirely invented "verse" attributed to a
  real book/chapter, which the corpus can't validate at all beyond
  `not_found`; this benchmark cannot fully distinguish fabrication from an
  obscure-but-real passage simply missing from a 34-passage fixture corpus.
  **Misattribution search is fixture-corpus-bounded**: `verify_quote` can
  only detect misattribution to one of these 34 passages — a quote that
  misattributes to a real verse *outside* the fixture corpus is reported as
  `not_found`, indistinguishable from pure fabrication at this scale. A
  production system needs the full YouVersion corpus, not just fixtures,
  before treating `not_found` as proof of fabrication.
- **Refusal masquerading as safety** — a model that declines to quote at all
  scores well on error rate while providing zero value; tracked via the
  not-found/refusal metric above so it isn't rewarded. `worstExamples`
  deliberately treats a null/missing similarity score (refusal) as *worse*
  than any numeric misquote score, so refusals surface rather than hide.

### What this benchmark does NOT claim

- It does not claim BSB (or any single translation) is the "correct" text —
  Scripture has legitimate translation variance; `verify_quote` measures
  fidelity to a *chosen reference translation*, not theological correctness.
  It also does not assert this away by fiat: `verify_quote` actively checks
  each miss against the other public-domain translations this project ships
  locally (WEB, KJV) and reports `different_translation` rather than
  `misquote` when that's what the evidence shows — and this run's own
  cross-translation check (RESULTS.md) found 0 of 11 ungrounded misses were
  actually accurate WEB/KJV quotes, reported honestly either way it landed.
- It does not claim a low misquote rate on 34 fixture passages generalizes to
  all ~31,000 Bible verses — the fixture corpus is intentionally small and
  reproducible for this submission; scaling the corpus is listed as future
  work, not assumed.
- It does not claim the grounded condition (2) measures whether the model
  "knows" Scripture — it measures whether the pipeline's retrieval and the
  model's instruction-following combine to reproduce supplied text exactly.
  The grounded+verify condition (3) is the one that reflects real product
  behavior end to end.
- It does not claim grounding "solves" hallucination — it converts an
  invisible failure (wrong Scripture stated with total confidence) into a
  measured, visible one (a `verdict` your application can act on: block,
  flag, or correct before the user sees it).

## Running it

```bash
npm run benchmark
# = node benchmark/runner.js --model gloo --condition all
```

Runs all three conditions sequentially against the live Gloo AI Studio API
(reading `GLOO_CLIENT_ID`/`GLOO_CLIENT_SECRET` from
`~/.config/doxa/gloo-api.env` via `src/env.js`, never committed/logged),
34 calls for ungrounded + 34 for grounded (condition 3 is derived, zero
extra calls — 68 live calls total for a full run). Calls are sequential with
a 350ms delay between them and retried once (after a 2s backoff) on a
429/5xx before falling back. Every raw model response is cached to
`benchmark/results/raw-<condition>.jsonl` as it's produced, so re-running
after an interruption resumes from cache instead of re-spending calls.

Single-condition / stub-mode runs for development:

```bash
node benchmark/runner.js --model stub --condition ungrounded   # zero network, exercises the harness
node benchmark/runner.js --model gloo --condition grounded     # one condition only
```

See `benchmark/runner.js` for the pluggable model-caller interface
(`quoteFromMemory` / `quoteGrounded`) and `benchmark/lib/` for the pure
scoring-aggregation and resume-from-cache logic (unit-tested in `tests/`,
zero network).
