const { callGeminiJson } = require('./geminiClient');

/**
 * Ask Gemini whether a ticket message is really suggesting the matched game, or whether the game's
 * name just happens to appear as ordinary words in conversation (e.g. "test", "Rust" in "it's rusty").
 *
 * Resolves to true / false, or null when the AI is unavailable so the caller can fall back to its own detection.
 */
async function verifyGameSuggestion(messageText, gameName) {
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

  const result = await callGeminiJson(prompt, {
    type: 'OBJECT',
    properties: { is_game_suggestion: { type: 'BOOLEAN' } },
    required: ['is_game_suggestion']
  });

  return typeof result?.is_game_suggestion === 'boolean' ? result.is_game_suggestion : null;
}

module.exports = { verifyGameSuggestion };
