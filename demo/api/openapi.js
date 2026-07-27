/**
 * GET /api/openapi.yaml — serves the OpenAPI 3.1 spec used as the ChatGPT
 * custom GPT's Actions config. Single source of truth: reads
 * integrations/chatgpt/openapi.yaml directly rather than duplicating its
 * content here, so the file judges/GPT-builders import from a URL always
 * matches the file committed (and reviewable) in the repo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCors } from './_lib/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.join(__dirname, '..', '..', 'integrations', 'chatgpt', 'openapi.yaml');

export default function handler(req, res) {
  applyCors(res, { methods: 'GET, OPTIONS' });
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed. Use GET.' }));
    return;
  }
  try {
    const yaml = readFileSync(SPEC_PATH, 'utf8');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.end(yaml);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Could not load OpenAPI spec: ${err.message}` }));
  }
}
