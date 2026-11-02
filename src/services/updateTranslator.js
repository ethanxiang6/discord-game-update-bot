const { callGeminiJson } = require('./geminiClient');
const { getCachedTranslation, cacheTranslation } = require('../database/db');

const MAX_CONTENT_CHARS = 7000;
const SAMPLE_CHARS = 1500;
const TRANSLATE_TIMEOUT_MS = 45000;

const ENGLISH_STOPWORDS = new Set([
  'the', 'and', 'of', 'to', 'a', 'in', 'is', 'for', 'with', 'on', 'are', 'we', 'you', 'this', 'that',
  'it', 'be', 'as', 'at', 'will', 'new', 'has', 'have', 'from', 'by', 'an', 'or', 'can', 'our', 'your'
]);

/**
 * Cheap pre-check so English posts never cost an AI call: flags text that is mostly non-Latin script,
 * or Latin-script text with very few common English words.
 */
function looksNonEnglish(title, content) {
  const sample = `${title}\n${content}`
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[[^\]]*\]|<[^>]*>/g, ' ')
    .slice(0, SAMPLE_CHARS);

  const letters = sample.match(/\p{L}/gu) || [];
  if (letters.length < 20) return false;

  const nonLatin = letters.filter((ch) => !/\p{Script=Latin}/u.test(ch)).length;
  if (nonLatin / letters.length > 0.2) return true;

  const words = sample.toLowerCase().match(/\p{L}+/gu) || [];
  if (words.length < 8) return false;
  const hits = words.filter((w) => ENGLISH_STOPWORDS.has(w)).length;
  return hits / words.length < 0.08;
}

async function translateWithGemini(title, content) {
  const prompt = [
    'You are translating video game update announcements / patch notes for an English-speaking Discord server.',
    'If the text below is already English, set is_english to true and leave title and content empty.',
    'Otherwise set is_english to false and translate BOTH the title and the content into natural English.',
    'Preserve all formatting exactly: BBCode/HTML tags, markdown, line breaks, lists, URLs, version numbers,',
    'and proper nouns such as game, character and item names (keep their official English names when known).',
    '',
    `TITLE: ${title}`,
    `CONTENT:\n${content.slice(0, MAX_CONTENT_CHARS)}`
  ].join('\n');

  const result = await callGeminiJson(
    prompt,
    {
      type: 'OBJECT',
      properties: {
        is_english: { type: 'BOOLEAN' },
        title: { type: 'STRING' },
        content: { type: 'STRING' }
      },
      required: ['is_english', 'title', 'content']
    },
    { timeoutMs: TRANSLATE_TIMEOUT_MS }
  );

  if (!result || typeof result.is_english !== 'boolean') return null;
  return result;
}

function applyTranslation(item, title, content) {
  return {
    ...item,
    originalTitle: item.title,
    title: title || item.title,
    // Keep the original body if the model returned nothing for a long post
    rawContent: content || item.rawContent,
    sourceName: `${item.sourceName || 'Official Update Feed'} (translated)`.slice(0, 100)
  };
}

/**
 * Translate a single update to English (no-op if it already is English or the AI is unavailable).
 * Results are cached in SQLite per update UID so each update is translated at most once.
 */
async function translateUpdateToEnglish(item) {
  if (!item || !item.uid) return item;

  const cached = getCachedTranslation(item.uid);
  if (cached) {
    return cached.translated ? applyTranslation(item, cached.title, cached.content) : item;
  }

  const title = item.title || '';
  const content = item.rawContent || '';
  if (!looksNonEnglish(title, content)) return item;

  const result = await translateWithGemini(title, content);
  if (!result) return item; // AI unavailable: show the original, retry on a later poll

  if (result.is_english || !result.title.trim()) {
    cacheTranslation(item.uid, '', '', false);
    return item;
  }

  cacheTranslation(item.uid, result.title, result.content, true);
  console.log(`🌐 [Translator] Translated update to English: "${result.title}"`);
  return applyTranslation(item, result.title, result.content);
}

async function translateUpdatesToEnglish(items) {
  const out = [];
  for (const item of items) {
    out.push(await translateUpdateToEnglish(item));
  }
  return out;
}

module.exports = { translateUpdateToEnglish, translateUpdatesToEnglish, looksNonEnglish };
