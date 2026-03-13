import OpenAI from 'openai';

// Lazy-initialize so a missing OPENAI_API_KEY doesn't crash the module at load
// time (which causes Netlify to return 500 before the handler even runs).
let _openai;
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
};

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// Some models (e.g., gpt-4o-mini) only support the default temperature=1.0.
// Force temperature to 1.0 when the selected model includes "mini".
const modelForcesDefaultTemperature = /mini/i.test(MODEL);
const pickTemperature = (desired) => modelForcesDefaultTemperature ? 1 : desired;

// Never send empty emails: if OpenAI returns empty content, fall back to a minimal placeholder.
const fallbackContent = (type) => `<!DOCTYPE html><html><body><p>No ${type} content generated this run.</p></body></html>`;
const extractContent = (response, type) => {
  const content = response?.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    console.error(`[AI] Empty content from OpenAI for ${type}, using fallback.`);
    return fallbackContent(type);
  }
  return content;
};

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
 * Signals are split by source so every source type is guaranteed representation.
 */
function trimDataForPrompt(data) {
  const cap = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : arr;

  // Split signals by source, take top N from each, then recombine
  const signalsBySource = {};
  for (const s of (data.signals || [])) {
    if (!signalsBySource[s.source]) signalsBySource[s.source] = [];
    signalsBySource[s.source].push(s);
  }
  const signals = [
    ...(signalsBySource.gdelt       || []).slice(0, 5),
    ...(signalsBySource.press       || []).slice(0, 5),
    ...(signalsBySource.googlenews  || []).slice(0, 8),
    ...(signalsBySource.reddit      || []).slice(0, 5),
  ];

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
    // Group by region, take up to 8 per region, and sort so BG always leads —
    // the AI tends to write sub-sections in the order it sees the data.
    regionalItems: (() => {
      const REGION_ORDER = ['BG', 'EU', 'NATO'];
      const byRegion = {};
      for (const item of (data.regionalItems || [])) {
        if (!byRegion[item.region]) byRegion[item.region] = [];
        byRegion[item.region].push(item);
      }
      const sortedRegions = [
        ...REGION_ORDER.filter(r => byRegion[r]),
        ...Object.keys(byRegion).filter(r => !REGION_ORDER.includes(r)),
      ];
      return sortedRegions.flatMap(r => byRegion[r].slice(0, 8));
    })(),
    // Structured data
    indicators:       cap(data.indicators,        10),
    upcomingReleases: cap(data.upcomingReleases,  5),
    contracts:        cap(data.contracts,         8),
    edgarFilings:     cap(data.edgarFilings,      8),
    cryptoSignals:    cap(data.cryptoSignals,     8),
    marketSignals:    cap(data.marketSignals,     8),
    watchlistHits:    cap(data.watchlistHits,     10),
    signals,
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
Some items may be in Bulgarian (Cyrillic). Read and summarize them in English.
No markdown. No inline styles.`;

  const userPrompt = `Generate today's intelligence digest using ONLY the data below.

Sections (use <h2> tags):
1.  🚨 Early Bird Signals       — newest first, label: <strong>[SOURCE NAME]</strong>
2.  🌍 Global News
3.  💻 Technology
4.  📈 Economy & Markets
5.  📅 Macro Calendar           — ALWAYS show all indicators from data.indicators (name, value, date, signals).
                                  Then list any items in data.upcomingReleases.
                                  Show every indicator even if its signals array is empty.
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
    const response = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: pickTemperature(0.3),
      max_completion_tokens: 4000,
    });

    return extractContent(response, 'digest');
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
    const response = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: pickTemperature(0.2),
      max_completion_tokens: 1500,
    });

    return extractContent(response, 'alert');
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
    const response = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: pickTemperature(0.3),
      max_completion_tokens: 1000,
    });

    return extractContent(response, 'midday');
  } catch (error) {
    console.error('[AI] OpenAI midday generation failed:', error.message);
    throw error;
  }
}
