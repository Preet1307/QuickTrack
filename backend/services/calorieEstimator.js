const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

function extractCalories(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const value = Number(JSON.parse(jsonMatch[0]).calories);
      if (Number.isFinite(value)) return value;
    } catch (err) {
      // Fall through to the plain-number parser.
    }
  }

  const numberMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
  return numberMatch ? Number(numberMatch[1]) : NaN;
}

async function estimateCalories({ type, name, user }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini calorie estimation is not configured. Add GEMINI_API_KEY to backend/.env or enter calories manually.');
  }

  const category = type === 'food' ? 'meal or food' : 'workout or physical activity';
  const userContext = type === 'workout'
    ? `The person weighs ${user.weight} kg and is ${user.age} years old.`
    : 'Estimate a typical serving unless the description includes a quantity.';
  const prompt = [
    `Estimate the calories ${type === 'food' ? 'consumed' : 'burned'} for this ${category}: "${name}".`,
    userContext,
    'Return only valid JSON in this exact shape: {"calories": number}.',
    'Use a realistic whole-number estimate. Do not include a range or extra text.',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Gemini could not estimate the calories.');
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const calories = Math.round(extractCalories(text));
  if (!Number.isFinite(calories) || calories <= 0 || calories > 20000) {
    throw new Error('Gemini returned an invalid calorie estimate. Enter calories manually and try again.');
  }
  return calories;
}

module.exports = { estimateCalories };