/**
 * Client for Gloo AI Studio (https://docs.ai.gloo.com), verified live on
 * 2026-07-27:
 *
 *   1. OAuth2 client-credentials token exchange:
 *        POST https://platform.ai.gloo.com/oauth2/token
 *        Content-Type: application/x-www-form-urlencoded
 *        Authorization: Basic base64(client_id:client_secret)
 *        body: grant_type=client_credentials&scope=api/access
 *        -> { access_token, expires_in, token_type: "Bearer" }
 *      Tokens are cached in-memory until shortly before they expire.
 *
 *   2. Chat completion:
 *        POST https://platform.ai.gloo.com/ai/v2/chat/completions
 *        Authorization: Bearer <access_token>
 *        body: { auto_routing: true, messages: [...], temperature, max_tokens }
 *      Confirmed response includes choices[0].message.content, model,
 *      provider, routing_mechanism, etc. (OpenAI-Chat-Completions-shaped).
 *
 * When no client id/secret is configured (or any live call fails), chat()
 * falls back to a stub mode that still demonstrates the grounding contract
 * (only ever quote the supplied passage, verbatim) without a network call,
 * so grounded_reply is runnable and testable with zero external dependency.
 */

const GLOO_BASE_URL = 'https://platform.ai.gloo.com';
const TOKEN_PATH = '/oauth2/token';
const CHAT_COMPLETIONS_PATH = '/ai/v2/chat/completions';
/** Refresh this many ms before actual expiry, to avoid racing a near-expired token. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/**
 * @param {{clientId?: string, clientSecret?: string, fetchImpl?: typeof fetch}} [opts]
 */
export function createGlooClient(opts = {}) {
  const clientId = opts.clientId ?? process.env.GLOO_CLIENT_ID;
  const clientSecret = opts.clientSecret ?? process.env.GLOO_CLIENT_SECRET;
  const doFetch = opts.fetchImpl ?? fetch;
  const isConfigured = Boolean(clientId && clientSecret);

  /** @type {{token: string, expiresAt: number} | null} */
  let cachedToken = null;

  async function getAccessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await doFetch(`${GLOO_BASE_URL}${TOKEN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: 'grant_type=client_credentials&scope=api/access',
    });
    if (!res.ok) throw new Error(`Gloo OAuth2 token exchange responded ${res.status}`);
    const data = await res.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(0, (data.expires_in ?? 0) * 1000 - TOKEN_REFRESH_MARGIN_MS),
    };
    return cachedToken.token;
  }

  /**
   * Send a chat completion request.
   * @param {{systemPrompt: string, userMessage: string, model?: string, temperature?: number, maxTokens?: number}} params
   * @returns {Promise<{text: string, source: 'gloo-api'|'stub', model?: string}>}
   */
  async function chat(params) {
    const { systemPrompt, userMessage, model, temperature = 0.3, maxTokens = 400 } = params;
    if (isConfigured) {
      try {
        const token = await getAccessToken();
        const body = {
          ...(model ? { model } : { auto_routing: true }),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature,
          max_tokens: maxTokens,
        };
        const res = await doFetch(`${GLOO_BASE_URL}${CHAT_COMPLETIONS_PATH}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Gloo AI Studio responded ${res.status}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        return { text, source: 'gloo-api', model: data.model };
      } catch (err) {
        return stubChat(params, err);
      }
    }
    return stubChat(params);
  }

  function stubChat(params, cause) {
    // Deterministic, no-network stub: demonstrates the grounding contract
    // (only ever quote the passage we hand it, verbatim) without calling a
    // model, so the tool runs and is testable with no external dependency.
    return {
      text:
        `[stub mode: no GLOO_CLIENT_ID/GLOO_CLIENT_SECRET configured${cause ? ` — live call failed: ${cause.message}` : ''}]\n` +
        `A grounded reply would answer using ONLY the canonical passage text ` +
        `supplied in the system prompt below, quoted verbatim with its reference cited.`,
      source: 'stub',
    };
  }

  return { chat, isConfigured };
}
