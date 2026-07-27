import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlooClient } from '../src/gloo-client.js';

test('with no clientId/clientSecret, isConfigured is false and chat returns a stub response', async () => {
  const client = createGlooClient({ clientId: undefined, clientSecret: undefined });
  assert.equal(client.isConfigured, false);
  const result = await client.chat({ systemPrompt: 'system', userMessage: 'hello' });
  assert.equal(result.source, 'stub');
  assert.match(result.text, /stub mode/);
});

test('when the OAuth2 token exchange fails, chat falls back to stub instead of propagating the error', async () => {
  const failingFetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const client = createGlooClient({ clientId: 'id', clientSecret: 'secret', fetchImpl: failingFetch });
  assert.equal(client.isConfigured, true);
  const result = await client.chat({ systemPrompt: 'system', userMessage: 'hello' });
  assert.equal(result.source, 'stub');
  assert.match(result.text, /token exchange responded 401/);
});

test('when configured and both calls succeed, chat performs OAuth2 token exchange then reports source gloo-api with the message content', async () => {
  const calls = [];
  const fakeFetch = async (url, fetchOpts) => {
    calls.push(url);
    if (url.endsWith('/oauth2/token')) {
      assert.equal(fetchOpts.method, 'POST');
      assert.equal(fetchOpts.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.equal(fetchOpts.headers.Authorization, `Basic ${Buffer.from('id:secret').toString('base64')}`);
      assert.equal(fetchOpts.body, 'grant_type=client_credentials&scope=api/access');
      return { ok: true, json: async () => ({ access_token: 'fake-token', expires_in: 3600, token_type: 'Bearer' }) };
    }
    if (url.endsWith('/ai/v2/chat/completions')) {
      assert.equal(fetchOpts.headers.Authorization, 'Bearer fake-token');
      const body = JSON.parse(fetchOpts.body);
      assert.equal(body.messages[0].role, 'system');
      assert.equal(body.messages[1].content, 'hello');
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Grounded answer text' } }], model: 'gloo-test' }),
      };
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };
  const client = createGlooClient({ clientId: 'id', clientSecret: 'secret', fetchImpl: fakeFetch });
  const result = await client.chat({ systemPrompt: 'system', userMessage: 'hello' });
  assert.equal(result.source, 'gloo-api');
  assert.equal(result.text, 'Grounded answer text');
  assert.equal(result.model, 'gloo-test');
  assert.deepEqual(calls, [`${GLOO_BASE()}/oauth2/token`, `${GLOO_BASE()}/ai/v2/chat/completions`]);
});

test('the access token is cached across multiple chat calls (only one token exchange for two chats)', async () => {
  let tokenCalls = 0;
  const fakeFetch = async (url) => {
    if (url.endsWith('/oauth2/token')) {
      tokenCalls++;
      return { ok: true, json: async () => ({ access_token: 'fake-token', expires_in: 3600, token_type: 'Bearer' }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'gloo-test' }) };
  };
  const client = createGlooClient({ clientId: 'id', clientSecret: 'secret', fetchImpl: fakeFetch });
  await client.chat({ systemPrompt: 's', userMessage: 'one' });
  await client.chat({ systemPrompt: 's', userMessage: 'two' });
  assert.equal(tokenCalls, 1);
});

function GLOO_BASE() {
  return 'https://platform.ai.gloo.com';
}
