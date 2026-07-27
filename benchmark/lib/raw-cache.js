/**
 * Resume-from-raw logic for the benchmark runner: raw model outputs are
 * cached to benchmark/results/raw-<condition>.jsonl as they're produced, so a
 * crash or interrupted run doesn't re-spend already-paid-for API calls.
 *
 * All fs access is injected (defaults to node:fs) so the resume/parsing
 * logic itself is unit-testable with an in-memory fake and no real files —
 * only src/index.js-adjacent runtime code touches the real filesystem.
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

const defaultFs = { existsSync, mkdirSync, readFileSync, appendFileSync };

/**
 * Parse JSONL content into records, tolerating a truncated final line (the
 * signature of a crash mid-write) by silently dropping any line that
 * doesn't parse rather than failing the whole load.
 * @param {string} content
 * @returns {object[]}
 */
export function parseJsonlContent(content) {
  const records = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      continue; // truncated/corrupt line — skip, don't lose the whole cache
    }
  }
  return records;
}

/**
 * Index parsed raw records by their `reference` field, last write wins (so
 * a reprocessed/retried reference's newest cached record is used).
 * @param {object[]} records
 * @returns {Map<string, object>}
 */
export function indexByReference(records) {
  const map = new Map();
  for (const record of records) {
    if (record && typeof record.reference === 'string') map.set(record.reference, record);
  }
  return map;
}

/**
 * Load a condition's raw-cache file into a Map keyed by reference. Returns
 * an empty Map if the file doesn't exist yet (first run).
 * @param {string} filePath
 * @param {Partial<typeof defaultFs>} [fsImpl]
 * @returns {Map<string, object>}
 */
export function loadRawCache(filePath, fsImpl = defaultFs) {
  if (!fsImpl.existsSync(filePath)) return new Map();
  const content = fsImpl.readFileSync(filePath, 'utf8');
  return indexByReference(parseJsonlContent(content));
}

/**
 * Append one raw record as a JSONL line, creating the parent directory if
 * needed. Never truncates/rewrites the file — pure append, so a crash after
 * N successful appends loses at most the in-flight (N+1)th call.
 * @param {string} filePath
 * @param {object} record
 * @param {Partial<typeof defaultFs>} [fsImpl]
 */
export function appendRawRecord(filePath, record, fsImpl = defaultFs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Pure resume decision: given the full list of references a condition needs
 * and the cache already loaded from disk, which references still need a
 * live call. (Separated from I/O so this decision is trivially unit-tested.)
 * @param {string[]} references
 * @param {Map<string, object>} cache
 * @returns {string[]}
 */
export function referencesNeedingFetch(references, cache) {
  return references.filter((ref) => !cache.has(ref));
}
