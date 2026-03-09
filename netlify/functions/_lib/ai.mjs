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
 * Trim data arrays to safe limits before sending to OpenAI.
 * GDELT alone can generate 15,000+ events — we only need the top signals.
 */
function trimDataForPrompt(data) {
  const cap = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : arr;
  return {
    ...data,
    // Main news sections — 10 each is sufficient
    globalNews:       cap(data.globalNews,       10),
    techNews:         cap(data.techNews,          10),
    economyNews:      cap(data.economyNews,       10),
    regionalNews:     cap(data.regionalNews,      10),
    // RSS + regional
    earlyBirdItems:   cap(data.earlyBirdItems,    10),
    centralBankItems: cap(data.centralBankItems,  5),
    regionalItems:    cap(data.regionalItems,     15),
    // Structured data
    indicators:       cap(data.indicators,        10),
    upcomingReleases: cap(data.upcomingReleases,  5),
    contracts:        cap(data.contracts,         8),
    edgarFilings:     cap(data.edgarFilings,      8),
    cryptoSignals:    cap(data.cryptoSignals,     8),
    marketSignals:    cap(data.marketSignals,     8),
    watchlistHits:    cap(data.watchlistHits,     10),
    // Intelligence signals — send top 20 by score (already sorted)
    signals:          cap(data.signals,           20),
  };
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
You have access to early intelligence signals from GDELT, press releases, Reddit, and Google News — often ahead of mainstream media.
Highlight any CONFIRMED cross-source signals prominently.
Use tone scores to gauge severity: below -3 indicates a serious event.
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
11. 🎯 Top Confirmed Signals   — ONLY if data.signals contains items with confirmed=true.
                                  Show top 3 confirmed signals in a highlighted box.
                                  For each: title, confirming sources, score, link.
12. 🌐 Global Early Signals    — ONLY if data.signals contains source='gdelt' items.
                                  Show top 5 GDELT events. For each: title, summary, tone score, link.
13. 📢 Corporate Announcements — ONLY if data.signals contains source='press' items.
                                  Show top 5 press releases. For each: title, summary, link.
14. ⚡ Real-Time Signals       — ONLY if data.signals contains source='reddit' items.
                                  Show top 5 posts. For each: text preview, link.
15. 📰 Breaking Headlines      — ONLY if data.signals contains source='googlenews' items.
                                  Show top 5 headlines. For each: title, link.

Rules:
- Sections 1–7: 3–5 items max per section/sub-section. Section 1: up to 8 items.
- Sections 8–10: facts only, no predictions, no buy/sell advice.
- Sections 11–15: only render if data.signals has matching items. Omit entirely if empty.
- End sections 8, 9, 10 with:
  <p><em>For informational purposes only. Not financial advice. Do your own research.</em></p>
- Never fabricate data not present below.
- Never render a section or sub-section that has no data.

DATA: ${JSON.stringify(trimDataForPrompt(data))}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_completion_tokens: 4000,
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
      max_completion_tokens: 1500,
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
      max_completion_tokens: 1000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('[AI] OpenAI midday generation failed:', error.message);
    throw error;
  }
}
