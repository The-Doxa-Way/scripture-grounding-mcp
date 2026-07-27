/**
 * grounded_reply: demonstrates the retrieve-then-constrain grounding
 * pattern this whole project is about. Given a topic or question, it:
 *   1. Retrieves a relevant canonical passage FIRST, from the fixture
 *      corpus (a simple keyword -> reference map — deliberately not an
 *      LLM call; retrieval should be boring and auditable).
 *   2. Calls Gloo AI Studio with a system prompt that REQUIRES the model to
 *      quote only that supplied text verbatim, never Scripture from its
 *      own training data.
 *
 * This is a demonstration of the pattern, not a general-purpose Bible
 * search: the keyword map covers the ~30 fixtures in this repo and falls
 * back to a default passage when nothing matches, always saying so.
 */
import { findByReference } from './fixtures.js';

/**
 * Ordered keyword -> reference map. Order matters: more specific keywords
 * are listed first so e.g. "anxious" resolves before a more generic "life"
 * keyword would. The first matching keyword wins.
 */
const KEYWORD_MAP = [
  [['anxious', 'anxiety', 'worry', 'worried'], 'Philippians 4:6-7'],
  [['afraid', 'fear', 'scared'], 'Isaiah 41:10'],
  [['peace'], 'John 14:27'],
  [['weary', 'tired', 'burden', 'rest'], 'Matthew 11:28-30'],
  [['future', 'plans', 'hope for the future'], 'Jeremiah 29:11'],
  [['strength', 'strong', 'weak', 'weakness'], 'Philippians 4:13'],
  [['trust', 'guidance', 'direction', 'decision'], 'Proverbs 3:5-6'],
  [['grief', 'sorrow', 'mourning', 'comfort'], 'Revelation 21:1-4'],
  [['shepherd', 'provide', 'provision'], 'Psalm 23:1-6'],
  [['salvation', 'saved', 'eternal life', 'gospel'], 'John 3:16-17'],
  [['new creation', 'change', 'transform', 'transformed'], '2 Corinthians 5:17'],
  [['faith', 'believe', 'believing'], 'Hebrews 11:1'],
  [['trial', 'trials', 'suffering', 'hardship', 'perseverance'], 'James 1:2-4'],
  [['purpose', 'work together', 'plan for me'], 'Romans 8:28-39'],
  [['grace', 'works', 'earn'], 'Ephesians 2:8-9'],
  [['protection', 'refuge', 'safe', 'shelter'], 'Psalm 91:1-2'],
  [['help', 'where does my help come from'], 'Psalm 121:1-2'],
  [['justice', 'fair', 'right thing'], 'Micah 6:8'],
  [['creation', 'beginning', 'origin'], 'Genesis 1:1-3'],
  [['overcome', 'trouble in the world', 'world'], 'John 16:33'],
  [['love'], '1 Corinthians 13:4-7'],
  [['alone', 'abandon', 'never leave'], 'Hebrews 13:5'],
  [['humility', 'humble', 'cast your cares'], '1 Peter 5:6-7'],
];

const DEFAULT_REFERENCE = 'Psalm 23:1-6';

/**
 * Pick the most relevant fixture passage for a free-text topic/question.
 * @param {string} topicOrQuestion
 * @returns {{reference: string, matchedKeyword: string|null}}
 */
export function pickPassage(topicOrQuestion) {
  const lower = (topicOrQuestion ?? '').toLowerCase();
  for (const [keywords, reference] of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return { reference, matchedKeyword: kw };
      }
    }
  }
  return { reference: DEFAULT_REFERENCE, matchedKeyword: null };
}

/**
 * Build the system prompt that constrains generation to the retrieved
 * canonical text. Exported separately so tests can assert on its contract
 * without needing a live Gloo call.
 * @param {{reference: string, text: string, translation: string}} passage
 * @returns {string}
 */
export function buildGroundedSystemPrompt(passage) {
  return [
    'You are a Scripture-grounded assistant. You must answer using ONLY the canonical passage text provided below.',
    `Passage (${passage.reference}, ${passage.translation}):`,
    `"${passage.text}"`,
    '',
    'Rules:',
    '- Quote the passage text verbatim when quoting Scripture. Do not paraphrase it as if it were the exact wording, and do not invent or recall any other Bible verses from memory.',
    '- Always cite the reference when you quote it.',
    '- If the passage does not fully address the question, say so honestly rather than filling the gap with unattributed Scripture.',
  ].join('\n');
}

/**
 * @param {{topicOrQuestion: string, glooClient: ReturnType<typeof import('./gloo-client.js').createGlooClient>}} params
 */
export async function groundedReply({ topicOrQuestion, glooClient }) {
  const { reference, matchedKeyword } = pickPassage(topicOrQuestion);
  const passage = findByReference(reference);
  if (!passage) {
    // Should not happen with the bundled fixture set, but fail loud rather
    // than silently generating ungrounded text.
    return {
      reply: null,
      groundedOn: null,
      error: `Internal error: expected fixture for "${reference}" was not found.`,
    };
  }
  const systemPrompt = buildGroundedSystemPrompt(passage);
  const result = await glooClient.chat({
    systemPrompt,
    userMessage: topicOrQuestion,
  });
  return {
    reply: result.text,
    source: result.source,
    groundedOn: {
      reference: passage.reference,
      translation: passage.translation,
      text: passage.text,
      matchedKeyword,
    },
  };
}
