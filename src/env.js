/**
 * Local-dev convenience loader: reads credential env files from
 * ~/.config/doxa/ (outside this repo, never committed) into process.env,
 * without overwriting any variable already set in the real environment
 * (so CI/production deployments that export real env vars directly take
 * priority, and this loader is purely a local-machine nicety).
 *
 * This is deliberately NOT auto-imported by the client module (src/
 * youversion-client.js) or by tests — only src/index.js calls it, so
 * `node --test` stays hermetic and never accidentally makes a live network
 * call using a real key sitting on a developer's machine.
 *
 * Expected file (see README for the exact key it sets):
 *   ~/.config/doxa/youversion-api.env  -> YOUVERSION_APP_KEY
 * A missing file is silently fine — the server runs keyless on the committed
 * BSB corpus.
 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function loadEnvFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadDoxaEnvFiles() {
  const dir = path.join(os.homedir(), '.config', 'doxa');
  loadEnvFile(path.join(dir, 'youversion-api.env'));
}
