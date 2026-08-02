// Vercel Serverless Function — AI food scanner proxy for Stokkd Fridge Mate
// Analyzes food images using Claude Vision and returns detected items

export default async function handler(req, res) {
  // CORS headers for app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, plan } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'No image provided' });
  }

  // Block free tier
  if (!plan || plan === 'free') {
    return res.status(403).json({ error: 'AI Camera requires a Pro or Family subscription' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

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
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image
              }
            },
            {
              type: 'text',
              text: 'Identify ALL food items visible in this image. Return ONLY a valid JSON array (no markdown, no explanation, no code fences). Each item must have these fields: {"name":"string","emoji":"single emoji","cat":"Dairy|Meat|Produce|Grains|Canned|Drinks|Snacks|Frozen|Condiments|Other","confidence":0-100,"cal":number,"kj":number,"protein":number,"carbs":number,"fat":number,"dest":"fridge|pantry|freezer","expDays":number}. Nutrition values are per 100g. expDays = typical shelf life in days. If no food items are visible, return an empty array [].'
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '[]';

    // Clean up response — remove any markdown code fences
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      const items = JSON.parse(cleaned);
      return res.status(200).json({ items });
    } catch (parseErr) {
      console.error('Parse error:', cleaned);
      return res.status(200).json({ items: [], error: 'Could not parse AI response' });
    }

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
