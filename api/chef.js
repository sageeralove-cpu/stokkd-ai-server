// Vercel Serverless Function — Claude AI proxy for Stokkd Fridge Mate
// Keeps your Anthropic API key hidden on the server

export default async function handler(req, res) {
  // CORS headers for app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, fridge, pantry, diets, plan, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'No message provided' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const systemPrompt = `You are AI Chef, the built-in cooking assistant for Stokkd Fridge Mate — a fridge & pantry tracking app. You help users cook meals using ingredients they already have.

RULES:
- Always prioritise ingredients that are EXPIRING SOON or EXPIRED — these need to be used first to reduce waste
- Include nutrition info (calories, kJ, protein) for every recipe you suggest
- Keep responses concise — max 3-4 short paragraphs
- Use emoji sparingly for visual appeal
- Respect dietary preferences: ${diets}
- The user's plan is: ${plan}
- Format recipes clearly with: name, time, difficulty, calories, kJ, protein, and brief steps
- If the user asks to modify a recipe, refer to the conversation history
- Suggest recipes from the user's available ingredients first, only suggest buying items if necessary
- Be warm, encouraging, and supportive — the user enjoys Korean minimal aesthetic and clean presentation

USER'S FRIDGE CONTENTS:
${fridge || 'No items tracked yet'}

USER'S PANTRY CONTENTS:
${pantry || 'No pantry items'}

DIETARY PREFERENCES: ${diets || 'None set'}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: buildMessages(history, message)
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Sorry, I couldn\'t generate a response. Try asking about a specific ingredient!';

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

function buildMessages(history, currentMessage) {
  const messages = [];

  // Parse recent history for context
  if (history) {
    const lines = history.split('\n').slice(-8); // Last 8 exchanges
    lines.forEach(line => {
      if (line.startsWith('user: ')) {
        messages.push({ role: 'user', content: line.replace('user: ', '') });
      } else if (line.startsWith('ai: ')) {
        messages.push({ role: 'assistant', content: line.replace('ai: ', '') });
      }
    });
  }

  // Add current message
  messages.push({ role: 'user', content: currentMessage });

  // Ensure messages alternate properly (Claude API requirement)
  const cleaned = [];
  let lastRole = null;
  messages.forEach(msg => {
    if (msg.role !== lastRole) {
      cleaned.push(msg);
      lastRole = msg.role;
    }
  });

  // Must start with user message
  if (cleaned.length > 0 && cleaned[0].role !== 'user') {
    cleaned.shift();
  }

  return cleaned.length > 0 ? cleaned : [{ role: 'user', content: currentMessage }];
}
