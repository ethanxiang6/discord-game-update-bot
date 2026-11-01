const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 8000;

/**
 * Ask Gemini whether a ticket message is really suggesting the matched game, or whether the game's
 * name just happens to appear as ordinary words in conversation (e.g. "test", "Rust" in "it's rusty").
 *
 * Resolves to true / false, or null when the AI is unavailable (no key, network error, quota, bad output)
 * so the caller can fall back to its own detection.
 */
async function verifyGameSuggestion(messageText, gameName) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const prompt = [
    'A user opened a Discord support ticket to suggest a video game to be added to a game-update tracker.',
    'Our name-matching system thinks their message refers to the game below, but it can be wrong when the',
    "game's title is a common word or phrase that just appears in normal conversation.",
    '',
    `Matched game: "${gameName}"`,
    `User message: """${String(messageText).slice(0, 500)}"""`,
    '',
    'Does the user message genuinely name or ask for this specific video game (typos, missing punctuation and',
    'lowercase are fine)? Answer false if the words only appear as ordinary conversation, a test, or filler,',
    'or if the user clearly means a different game.'
  ].join('\n');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: { is_game_suggestion: { type: 'BOOLEAN' } },
              required: ['is_game_suggestion']
            }
          }
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
      }
    );

    if (!res.ok) {
      console.warn(`[AI Verifier] Gemini returned HTTP ${res.status}; falling back to name matching.`);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(text);
    return typeof parsed.is_game_suggestion === 'boolean' ? parsed.is_game_suggestion : null;
  } catch (err) {
    console.warn(`[AI Verifier] Unavailable (${err.message}); falling back to name matching.`);
    return null;
  }
}

module.exports = { verifyGameSuggestion };
