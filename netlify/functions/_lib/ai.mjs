import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

/**
 * Generate newsletter content using OpenAI
 * @param {string} type - 'digest' | 'alert' | 'midday'
 * @param {object} data - Compiled data from all sources
 * @returns {Promise<string>} HTML content
 */
export default async function generateContent(type, data) {
  // Validate that we have data
  const hasData = Object.values(data).some(value => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(v => Array.isArray(v) ? v.length > 0 : false);
    }
    return false;
  });

  if (!hasData) {
    throw new Error('No data to generate content from');
  }

  if (type === 'digest') {
    return await generateDigest(data);
  } else if (type === 'alert') {
    return await generateAlert(data);
  } else if (type === 'midday') {
    return await generateMidday(data);
  }

  throw new Error(`Unknown content type: ${type}`);
}

/**
 * Generate daily digest
 */
async function generateDigest(data) {
  const systemPrompt = `You are a professional intelligence analyst and newsletter editor.
Write a daily briefing in clean HTML for email clients.
Use ONLY the provided data. Never invent or hallucinate facts.
If a section has no data write: <p>No updates today.</p>
Every item MUST have a source link: <a href="URL">[Source]</a>. Omit items without URLs.
No markdown. No inline styles.`;

  const userPrompt = `Generate today's intelligence digest using ONLY the data below.

Sections (use <h2> tags):
1.  🚨 Early Bird Signals       — newest first, label: <strong>[SOURCE NAME]</strong>
2.  🌍 Global News
3.  💻 Technology
4.  📈 Economy & Markets
5.  📅 Macro Calendar           — upcoming releases + active indicator signals
6.  🗺️  Regional Intelligence   — one sub-section per active region in the data
                                  e.g. <h3>🇧🇬 Bulgaria</h3>, <h3>🇪🇺 European Union</h3>, <h3>🛡️ NATO & Defence</h3>
                                  Only render sub-sections that have data. Skip empty regions.
                                  For Bulgaria: flag EURO_ADOPTION, ENERGY_TRANSIT, EU_FUNDS signals prominently.
                                  For NATO: flag defence contract awards and Article 5 news first.
7.  📋 Government Contracts     — label tier: <strong>[EARLY SIGNAL/ACTIVE RFP/AWARDED]</strong>
8.  🪙 Crypto Signals           — price, 24h change (green/red), detected signals
9.  📊 Stock Signals            — ticker, price, change, analyst target, signals
10. 🔭 Watchlist                — watchlistHits only; empty = "No watchlist activity today."
                                  Group by region if regional hits present.

Rules:
- Sections 1–7: 3–5 items max per section/sub-section. Section 1: up to 8 items.
- Sections 8–10: facts only, no predictions, no buy/sell advice.
- End sections 8, 9, 10 with:
  <p><em>For informational purposes only. Not financial advice. Do your own research.</em></p>
- Never fabricate data not present below.
- Never render a section or sub-section that has no data.

DATA: ${JSON.stringify(data, null, 2)}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('[AI] OpenAI digest generation failed:', error.message);
    throw error;
  }
}

/**
 * Generate breaking alert
 */
async function generateAlert(signal) {
  const systemPrompt = `You are a breaking news analyst. Write a concise factual alert in HTML.
3–5 sentences max. Lead with the most important fact. No speculation.`;

  const userPrompt = `Write a breaking alert for this signal: ${JSON.stringify(signal, null, 2)}

Format:
<h2>Brief headline</h2>
<p>What happened, why it matters, what to watch — facts only.</p>
<p>Source: <a href="URL">Source Name</a></p>
<p><em>Not financial advice.</em></p>`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('[AI] OpenAI alert generation failed:', error.message);
    throw error;
  }
}

/**
 * Generate midday bundle
 */
async function generateMidday(signals) {
  const systemPrompt = `You are a professional intelligence analyst and newsletter editor.
Write a daily briefing in clean HTML for email clients.
Use ONLY the provided data. Never invent or hallucinate facts.`;

  const userPrompt = `Write a concise midday update from the signals below.
Title: "Notable signals since this morning". Max 5 items.
Each: signal type label + one sentence + source link.
DATA: ${JSON.stringify(signals, null, 2)}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('[AI] OpenAI midday generation failed:', error.message);
    throw error;
  }
}
