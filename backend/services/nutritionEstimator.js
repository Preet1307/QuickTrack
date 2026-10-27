const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

function parseJson(text) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf('{');
    if (start === -1) throw new Error('Gemini returned an invalid nutrition estimate.');

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < normalized.length; index += 1) {
      const character = normalized[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') {
        inString = true;
      } else if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(normalized.slice(start, index + 1));
          } catch {
            throw new Error('Gemini returned an invalid nutrition estimate.');
          }
        }
      }
    }

    throw new Error('Gemini returned an incomplete nutrition estimate.');
  }
}

async function estimateNutrition({ name, user, supplement = false, calories }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Gemini is not configured. Add GEMINI_API_KEY to backend/.env.');
  const prompt = [
    `Estimate one serving of this ${supplement ? 'supplement and daily dose' : 'food'}: ${name}`,
    ...(Number.isFinite(Number(calories)) && Number(calories) > 0
      ? [`The serving is logged as ${Number(calories)} calories; estimate the nutrients for that same serving.`]
      : []),
    'Return only valid JSON with numeric values for calories, protein, carbs, fat, and fiber.',
    'Use grams for all nutrients. Make reasonable approximate assumptions when serving size is unclear.',
    `User context for serving assumptions: ${JSON.stringify({ weightKg: user?.weight, goal: user?.goal })}`,
  ].join('\n');
  let response;
  let data;
  for (const model of new Set([GEMINI_MODEL, 'gemini-3.5-flash-lite'])) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  calories: { type: 'NUMBER' },
                  protein: { type: 'NUMBER' },
                  carbs: { type: 'NUMBER' },
                  fat: { type: 'NUMBER' },
                  fiber: { type: 'NUMBER' },
                },
                required: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
              },
            },
          }),
        },
      );
      try {
        data = await response.json();
      } catch {
        throw new Error('Gemini returned a non-JSON API response.');
      }
      if (response.ok) break;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(data.error?.message || 'Gemini could not estimate nutrition right now.');
      }
      if (response.status === 429 || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 500 * (2 ** attempt)));
    }
    if (response.ok) break;
  }

  if (!response.ok) {
    throw new Error(data.error?.message || 'Gemini could not estimate nutrition right now.');
  }
  const candidate = data.candidates?.[0];
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(reason
      ? `Gemini could not estimate nutrition because the request was blocked (${reason}).`
      : 'Gemini returned no nutrition estimate. Please try again.');
  }
  const text = candidate.content?.parts?.map(part => part.text || '').join('').trim();
  if (!text) {
    throw new Error(candidate.finishReason === 'MAX_TOKENS'
      ? 'Gemini returned an incomplete nutrition estimate. Please try again.'
      : 'Gemini returned no nutrition estimate. Please try again.');
  }
  const estimate = parseJson(text);
  const values = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
  if (values.some(key => !Number.isFinite(Number(estimate[key])) || Number(estimate[key]) < 0)) {
    throw new Error('Gemini returned incomplete nutrition data.');
  }
  return Object.fromEntries(values.map(key => [key, Math.round(Number(estimate[key]) * 10) / 10]));
}

module.exports = { estimateNutrition };