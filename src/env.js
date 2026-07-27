/**
 * Local-dev convenience loader: reads credential env files from
 * ~/.config/doxa/ (outside this repo, never committed) into process.env,
 * without overwriting any variable already set in the real environment
 * (so CI/production deployments that export real env vars directly take
 * priority, and this loader is purely a local-machine nicety).
 *
 * This is deliberately NOT auto-imported by the client modules (src/
 * youversion-client.js, src/gloo-client.js) or by tests — only src/index.js
 * calls it, so `node --test` stays hermetic and never accidentally makes a
 * live network call using a real key sitting on a developer's machine.
 *
 * Expected files (see README for the exact keys each one sets):
 *   ~/.config/doxa/youversion-api.env  -> YOUVERSION_APP_KEY
 *   ~/.config/doxa/gloo-api.env        -> GLOO_CLIENT_ID, GLOO_CLIENT_SECRET
 * Missing files are silently fine — the server runs keyless on fixtures/stub.
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
  loadEnvFile(path.join(dir, 'gloo-api.env'));
}
