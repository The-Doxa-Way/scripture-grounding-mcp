// kg-save-gate-merge-integrity.test.cjs — proves the merge-integrity check
// (review 2026-08-13, PLACEMENT finding) actually fires on the
// mcp__github__merge_pull_request landing path, not just on paper.
//
// This repo's kg-save-gate.sh has NO `gh pr merge`-specific KG-Guard-verdict
// fast path (unlike doxa-cns's hook) — its Bash-command flow already runs
// the merge-integrity check before all of ITS OWN exit-0 paths. The actual
// blind spot here is a SEPARATE, earlier branch: an MCP merge
// (mcp__github__merge_pull_request) never extracts .tool_input.command at
// all, so a check placed only in the Bash-command flow (further down the
// file) is completely unreachable for it. That branch has its own exit-0
// fast path — "the PR diff already touches .knowledge-graph/" — which fires
// on any ordinary kg-saved PR, independent of whether a MERGE COMMIT inside
// that PR's local history dropped an observation. This test drives the REAL
// hook against a throwaway repo containing a synthetic instance of the real
// incident (a merge commit that drops an observation unique to one parent),
// with a stubbed `gh` that reports a normal kg-saved PR diff — if the
// placement fix ever regresses, this is the test that catches it.
//
// Run: node --test tests/kg-save-gate-merge-integrity.test.cjs

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.resolve(__dirname, '../.claude/hooks/kg-save-gate.sh');
const REAL_INTEGRITY_SCRIPT = path.resolve(__dirname, '../scripts/check-kg-merge-integrity.cjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function merkle(observations) {
  return JSON.stringify({ merkleRoot: 'x', observations, lastVerified: null, version: 1 }, null, 2);
}

function writeAndCommit(dir, observations, message) {
  fs.writeFileSync(path.join(dir, '.knowledge-graph-merkle.json'), merkle(observations));
  git(['add', '-A'], dir);
  git(['commit', '-qm', message], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

// Builds a throwaway repo shaped like the real incident:
//   A (root, obs h1)
//   ├─ main tip M1 (adds h2)   <- origin/main points here (already "pushed")
//   └─ feature tip F1 (adds h3)
// HEAD = a merge of M1 and F1 resolved by keeping ONLY M1's content (the
// `git checkout --theirs`/`--ours` anti-pattern) — h3 (unique to F1, a real
// parent of the merge) is silently dropped from the result.
function repoWithDroppedObservation() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kgsg-'));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'g@d'], dir);
  git(['config', 'user.name', 'g'], dir);

  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(REAL_INTEGRITY_SCRIPT, path.join(dir, 'scripts', 'check-kg-merge-integrity.cjs'));

  const base = writeAndCommit(dir, [{ hash: 'h1', entityName: 'Base', content: 'c', provenance: {}, timestamp: '2026-01-01T00:00:00.000Z' }], 'base');

  const m1 = writeAndCommit(dir, [
    { hash: 'h1', entityName: 'Base', content: 'c', provenance: {}, timestamp: '2026-01-01T00:00:00.000Z' },
    { hash: 'h2', entityName: 'Two', content: 'c', provenance: {}, timestamp: '2026-01-02T00:00:00.000Z' },
  ], 'M1: add Two');
  // origin/main = M1, simulating "already pushed" state the merge lands onto.
  git(['update-ref', 'refs/remotes/origin/main', m1], dir);

  git(['checkout', '-q', '-b', 'feature', base], dir);
  writeAndCommit(dir, [
    { hash: 'h1', entityName: 'Base', content: 'c', provenance: {}, timestamp: '2026-01-01T00:00:00.000Z' },
    { hash: 'h3', entityName: 'Three', content: 'c', provenance: {}, timestamp: '2026-01-03T00:00:00.000Z' },
  ], 'F1: add Three');

  git(['checkout', '-q', 'main'], dir);
  try { git(['merge', '--no-commit', '--no-ff', 'feature'], dir); } catch { /* expected: conflicts on the merkle file */ }
  // Anti-pattern resolution: keep ONLY main's side, silently dropping h3.
  fs.writeFileSync(path.join(dir, '.knowledge-graph-merkle.json'), merkle([
    { hash: 'h1', entityName: 'Base', content: 'c', provenance: {}, timestamp: '2026-01-01T00:00:00.000Z' },
    { hash: 'h2', entityName: 'Two', content: 'c', provenance: {}, timestamp: '2026-01-02T00:00:00.000Z' },
  ]));
  git(['add', '-A'], dir);
  git(['commit', '-qm', 'Merge feature into main (drops h3 — simulated incident)'], dir);

  return dir;
}

// Same shape, but resolved CORRECTLY (union of both sides) — nothing dropped.
function repoWithCorrectMerge() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kgsg-'));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'g@d'], dir);
  git(['config', 'user.name', 'g'], dir);

  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(REAL_INTEGRITY_SCRIPT, path.join(dir, 'scripts', 'check-kg-merge-integrity.cjs'));

  const base = writeAndCommit(dir, [{ hash: 'h1', entityName: 'Base', content: 'c', provenance: {}, timestamp: '2026-01-01T00:00:00.000Z' }], 'base');

  const m1 = writeAndCommit(dir, [
    { hash: 'h1', entityName: 'Base', content: 'c', provenance: {}, timestamp: '2026-01-01T00:00:00.000Z' },
    { hash: 'h2', entityName: 'Two', content: 'c', provenance: {}, timestamp: '2026-01-02T00:00:00.000Z' },
  ], 'M1: add Two');
  git(['update-ref', 'refs/remotes/origin/main', m1], dir);

  git(['checkout', '-q', '-b', 'feature', base], dir);
  writeAndCommit(dir, [
    { hash: 'h1', entityName: 'Base', content: 'c', provenance: {}, timestamp: '2026-01-01T00:00:00.000Z' },
    { hash: 'h3', entityName: 'Three', content: 'c', provenance: {}, timestamp: '2026-01-03T00:00:00.000Z' },
  ], 'F1: add Three');

  git(['checkout', '-q', 'main'], dir);
  try { git(['merge', '--no-commit', '--no-ff', 'feature'], dir); } catch { /* expected: conflicts on the merkle file */ }
  // Correct resolution: union of both sides — nothing dropped.
  fs.writeFileSync(path.join(dir, '.knowledge-graph-merkle.json'), merkle([
    { hash: 'h1', entityName: 'Base', content: 'c', provenance: {}, timestamp: '2026-01-01T00:00:00.000Z' },
    { hash: 'h2', entityName: 'Two', content: 'c', provenance: {}, timestamp: '2026-01-02T00:00:00.000Z' },
    { hash: 'h3', entityName: 'Three', content: 'c', provenance: {}, timestamp: '2026-01-03T00:00:00.000Z' },
  ]));
  git(['add', '-A'], dir);
  git(['commit', '-qm', 'Merge feature into main (correct union)'], dir);

  return dir;
}

// Stubs `gh` to report a normal, already-kg-saved PR diff (touches
// .knowledge-graph/graph.json) — the exact condition under which the
// ORIGINAL (buggy-placement) MCP-merge branch exited 0 before ever reaching
// the merge-integrity check.
function stubGhOrdinaryKgSavedDiff() {
  const bindir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghbin-'));
  const script = `#!/bin/bash
args="$*"
case "$args" in
  *"pr diff"*"--name-only"*) printf '.knowledge-graph/graph.json\\n.knowledge-graph-merkle.json\\n'; exit 0 ;;
  *) exit 0 ;;
esac
`;
  fs.writeFileSync(path.join(bindir, 'gh'), script);
  fs.chmodSync(path.join(bindir, 'gh'), 0o755);
  return bindir;
}

function runGateViaMcpMerge(dir, ghbin) {
  const payload = JSON.stringify({
    tool_name: 'mcp__github__merge_pull_request',
    tool_input: { repo: 'scripture-grounding-mcp', owner: 'The-Doxa-Way', pullNumber: 239 },
    cwd: dir,
  });
  try {
    execFileSync('bash', [HOOK], {
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, PATH: `${ghbin}:${process.env.PATH}` },
      input: payload,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0 };
  } catch (e) {
    return { status: e.status, stderr: (e.stderr || '').toString() };
  }
}

test('MCP merge with an ordinary kg-saved PR diff still blocks a merge commit that dropped an observation', () => {
  const dir = repoWithDroppedObservation();
  const ghbin = stubGhOrdinaryKgSavedDiff();
  const result = runGateViaMcpMerge(dir, ghbin);
  assert.strictEqual(result.status, 2, 'must block despite a normal kg-saved PR diff — this is the placement fix');
  assert.match(result.stderr, /dropped knowledge-graph observations/);
  assert.match(result.stderr, /Three/, 'must name the dropped entity');

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(ghbin, { recursive: true, force: true });
});

test('MCP merge with an ordinary kg-saved PR diff passes a correctly-unioned merge (no false positive)', () => {
  const dir = repoWithCorrectMerge();
  const ghbin = stubGhOrdinaryKgSavedDiff();
  const result = runGateViaMcpMerge(dir, ghbin);
  assert.strictEqual(result.status, 0, 'a correct union must not be blocked');

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(ghbin, { recursive: true, force: true });
});
