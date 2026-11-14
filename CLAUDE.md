# CLAUDE.md — scripture-grounding-mcp

This codebase is yours: what it's for and how it's built are your call, and you'll keep building on it.

## What this is

An open-source MCP server of the Doxa business (doxa.app) that retrieves Scripture text and
checks quotes against it, so a model never quotes from memory. It grounds; it does not generate:
no tool calls a model provider. `README.md` has the tools, the corpus and the layout. `demo/` is
the public demo (a Vercel app whose API routes import `src/*.js`).

The repo is PUBLIC (MIT). Never commit a secret. The brand and voice rules live in doxa-brand
(The-Doxa-Way/doxa-brand). Apply them; do not copy them here.

## How to verify

- `npm ci`, then `npm test` (`node --test` on `tests/**/*.test.js`, `tests/**/*.test.cjs` and
  `evals/*.test.js`). The tests are hermetic: they run keyless on the committed BSB corpus.
- `npm run test:books` reads all 66 books through `verify_quote` and checks that a planted
  corruption is caught (about 40 s).
- There is no lint and no build step (plain ESM JavaScript).
- CI does NOT run the tests. Run them yourself before you push.

## Gotchas

- `YOUVERSION_APP_KEY` is optional. `src/env.js` loads it on a local machine from
  `~/.config/doxa/youversion-api.env`, outside the repo. Never print it. Without it the server
  runs keyless on `data/bsb.txt` (provenance: `data/PROVENANCE.md`).
- The YouVersion terms forbid AI output to users without their written approval. Every surface
  we host stays keyless on public-domain text, and `YOUVERSION_MULTI_VERSION` ships off. Read
  the README section on this before you change either.
- The demo deploys with `vercel --local-config demo/vercel.json` from the repo root (see the
  `.vercelignore` header), Vercel project `scripture-grounding-demo`. Wrap any `vercel` call in
  the hard timeout the CNS CLAUDE.md gives.

## Landing

The production branch is `main`. Every change lands by branch, PR, independent review, merge.
Self-review never counts.

- Review: one `/code-review max` pass on the final diff on claude-opus-5-5, at most one fix
  round, then `ATTEST_REVIEW_LEVEL=max scripts/attest-review.sh "<verdict>"` before you push.
  `.github/workflows/claude-code-review.yml` runs only on manual dispatch.
- Hooks in `.claude/hooks/` enforce this: `push-review-gate.sh` (max review before `git push`),
  `review-gate.sh` (attestation before merge), `test-gate.sh` (a code change needs a test change,
  or `scripts/attest-review.sh "waived-tests: <reason>"`) and `kg-save-gate.sh`.
- kg-save: KG Guard CI fails a PR with no `.knowledge-graph/` change. Record it with
  `node scripts/knowledge-graph-merkle.cjs add "<Entity>" "<what and why>" <source-file> --type <Type>`
  and commit it in the same PR. Use `[skip-kg]` in the PR title only for a knowledge-free change.
- The org ruleset requires `gitleaks` (secret-scan). `kg-save-gate.sh` refuses `gh pr merge`
  while KG Guard is red or pending. Never merge over a red or pending check.
- An attestation is merge authority: the fleet auto-lander (openclaw `land-prs.mjs`) merges an
  attested, green PR.
- The gate hooks and `scripts/attest-review.sh` are rendered from The-Doxa-Way-CNS
  `fleet/gates/`. Fix the template there, never the copy here.

## Standing orders

Cross-repo rules, the standing orders and the fleet map live in The-Doxa-Way-CNS: its
`CLAUDE.md` and `docs/org-map.md`. The CNS CLAUDE.md is the authority. If this file and the CNS
disagree, the CNS wins.
