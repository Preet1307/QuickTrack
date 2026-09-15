const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini returned an invalid nutrition estimate.');
  return JSON.parse(match[0]);
}

async function estimateNutrition({ name, user, supplement = false }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Gemini is not configured. Add GEMINI_API_KEY to backend/.env.');
  const prompt = [
    `Estimate one serving of this ${supplement ? 'supplement and daily dose' : 'food'}: ${name}`,
    'Return only valid JSON with numeric values for calories, protein, carbs, fat, and fiber.',
    'Use grams for all nutrients. Make reasonable approximate assumptions when serving size is unclear.',
    `User context for serving assumptions: ${JSON.stringify({ weightKg: user?.weight, goal: user?.goal })}`,
  ].join('\n');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 200 } }),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Gemini could not estimate nutrition right now.');
  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  const estimate = parseJson(text || '');
  const values = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
  if (values.some(key => !Number.isFinite(Number(estimate[key])) || Number(estimate[key]) < 0)) {
    throw new Error('Gemini returned incomplete nutrition data.');
  }
  return Object.fromEntries(values.map(key => [key, Math.round(Number(estimate[key]) * 10) / 10]));
}

module.exports = { estimateNutrition };