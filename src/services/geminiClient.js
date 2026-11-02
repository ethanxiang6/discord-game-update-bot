const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * Call Gemini and return the parsed JSON object that matches `schema`.
 * Resolves to null when the AI is unavailable (no key, network error, quota, malformed output) so callers can fall back.
 */
async function callGeminiJson(prompt, schema, { timeoutMs = 8000 } = {}) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

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
            responseSchema: schema
          }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      }
    );

    if (!res.ok) {
      console.warn(`[Gemini] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch (err) {
    console.warn(`[Gemini] Unavailable (${err.message})`);
    return null;
  }
}

module.exports = { callGeminiJson };
