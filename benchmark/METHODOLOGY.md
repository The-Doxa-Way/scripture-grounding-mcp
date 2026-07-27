# Benchmark methodology

**Status: measured, not solved.** This document specifies a reproducible way to
measure how often an LLM misquotes Scripture, and how much a retrieve-then-verify
pipeline (this MCP server) reduces that error — not a claim that either the
problem or the fix is complete. Numbers below are placeholders for a
methodology; running `benchmark/runner.js` against real model API keys
produces the actual numbers, which belong in a results file, not in this doc.

## Motivation

Independent research on LLM Scripture recall (see e.g. the "Scripture in New
Frontiers" challenge brief and the Gruenewald et al. line of work on Bible
quotation accuracy) has reported misquotation rates in ungrounded models
ranging roughly **15%–60%** depending on model, translation, and passage
obscurity. That range is wide because methodology varies a lot between
studies (what counts as a "quote," which translation is ground truth, how
paraphrase is scored). This benchmark exists to make our own number
reproducible rather than to adjudicate that range.

## Design

### Corpus

`fixtures/bsb/*.json` — 34 passages from the Berean Standard Bible (BSB,
public domain), chosen for genre coverage:

| Genre | Example passages |
|---|---|
| Narrative | Genesis 1:1-3 |
| Poetry / wisdom | Psalm 23, Psalm 46, Proverbs 3:5-6 |
| Prophecy | Isaiah 53:4-6, Jeremiah 29:11, Micah 6:8 |
| Gospel | Matthew 5:3-10, John 3:16-17, John 14:6 |
| Epistle | Romans 8:28-39, Philippians 4:6-7, Hebrews 11:1 |
| Apocalyptic | Revelation 21:1-4 |

BSB is the ground-truth translation for this benchmark because it is fully
public domain (dedicated 2023) and because it is a single fixed baseline
every condition can be scored against consistently. This does **not** imply
BSB is "more correct" than other translations — translation choice is a
separate axis this methodology deliberately holds constant. (In an actual
deployed app, the YouVersion Platform API supplies whichever of its 2,000+
licensed translations the end user has chosen; the benchmark's fixed BSB
baseline is a measurement-methodology choice, not a product default.)

### Conditions

1. **Ungrounded** — prompt a model directly: *"Quote \<reference\> exactly."*
   Score its raw output against the BSB fixture text. This simulates the
   failure mode: the model answering from parametric memory.
2. **Grounded** — retrieve the BSB fixture text via `get_passage`, then ask
   the model to quote it back (an easier task — this measures the retrieval
   plumbing and prompt-following, i.e. a ceiling/sanity check).
3. **Grounded + verify_quote** — take the model's own free-form answer
   (which may cite Scripture unprompted) and run every claimed quote through
   `verify_quote` before it reaches a user. This is the condition that
   matters for the actual product: it doesn't make the model quote
   correctly, it catches the model when it doesn't.

### Metrics

- **Exact-match rate** — fraction of quotes classified `exact` by
  `verify_quote`.
- **Word error rate (WER)** — `1 - similarityScore` from `verify_quote`,
  averaged across quotes; a continuous companion to the categorical verdict.
- **Misattribution rate** — fraction of quotes classified `misattribution`
  (fluent, real-sounding Scripture wording pinned to the wrong reference —
  the failure mode that is hardest for a human to catch by eye).
- **Not-found / refusal rate** — fraction where the model declines to answer
  or its answer resembles nothing in the corpus; tracked separately so a low
  misquote rate can't hide a model that's simply dodging the question.

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
  A production system needs the full YouVersion corpus, not just fixtures,
  before treating `not_found` as proof of fabrication.
- **Refusal masquerading as safety** — a model that declines to quote at all
  scores well on error rate while providing zero value; tracked via the
  not-found/refusal metric above so it isn't rewarded.

### What this benchmark does NOT claim

- It does not claim BSB (or any single translation) is the "correct" text —
  Scripture has legitimate translation variance; `verify_quote` measures
  fidelity to a *chosen reference translation*, not theological correctness.
- It does not claim a low misquote rate on 34 fixture passages generalizes to
  all ~31,000 Bible verses — the fixture corpus is intentionally small and
  reproducible for this submission; scaling the corpus is listed as future
  work, not assumed.
- It does not claim grounding "solves" hallucination — it converts an
  invisible failure (wrong Scripture stated with total confidence) into a
  measured, visible one (a `verdict` your application can act on:
  block, flag, or correct before the user sees it).

## Running it

```bash
node benchmark/runner.js --model <caller-name> --condition ungrounded|grounded|grounded-verify
```

See `benchmark/runner.js` for the pluggable model-caller interface. Model
callers are env-keyed (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`GLOO_API_KEY`) and stubbed by default so the harness runs with zero
external calls until real keys are supplied — consistent with the rest of
this repo's "runs today in fixture/stub mode" design.
