const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

async function getSmartChoiceReply({ user, entries, supplements, message, history }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini is not configured. Add GEMINI_API_KEY to backend/.env.');
  }

  const context = {
    profile: {
      age: user.age,
      heightCm: user.height,
      weightKg: user.weight,
      goal: user.goal,
      medications: user.meds || 'not provided',
    },
    recentEntries: entries.map(entry => ({ date: entry.date, type: entry.type, description: entry.name, calories: entry.cal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, fiber: entry.fiber })),
    ongoingSupplements: (supplements || []).map(supplement => ({ name: supplement.name, dailyDose: supplement.dose, calories: supplement.calories, protein: supplement.protein, carbs: supplement.carbs, fat: supplement.fat, fiber: supplement.fiber })),
  };
  const conversation = (Array.isArray(history) ? history : [])
    .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string')
    .slice(-10)
    .map(item => `${item.role === 'user' ? 'User' : 'SmartChoice'}: ${item.text.slice(0, 1000)}`)
    .join('\n');
  const prompt = [
    'You are SmartChoice, a practical fitness and nutrition assistant inside QuickTrack.',
    'Use the user context and recent log data below to answer the latest question.',
    'Give concise, personalized, actionable suggestions. Do not diagnose conditions, prescribe medication, or replace a doctor or dietitian.',
    'If medications or a health condition could affect the answer, recommend checking with a qualified clinician.',
    `User context JSON: ${JSON.stringify(context)}`,
    conversation ? `Recent conversation:\n${conversation}` : '',
    `Latest question: ${message.slice(0, 2000)}`,
  ].filter(Boolean).join('\n\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 700 } }),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Gemini could not answer right now.');
  const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  if (!reply) throw new Error('Gemini returned an empty response.');
  return reply;
}

module.exports = { getSmartChoiceReply };