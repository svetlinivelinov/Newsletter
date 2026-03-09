/**
 * Watchlist — Cross-source company/ticker/region filter
 * Tags all items that mention watched entities
 */

import { fetchGDELT } from './gdelt.mjs';
import { fetchPressReleases } from './press.mjs';
import { fetchRedditBreaking } from './reddit.mjs';
import { fetchGoogleNews } from './rss.mjs';

/**
 * Apply watchlist filtering to all collected data
 * @param {object} allData - All data from sources
 * @returns {object} { watchlistHits, updatedData }
 */
export default function applyWatchlist(allData) {
  // Parse watchlists from env
  const watchedCompanies = (process.env.WATCHED_COMPANIES || '')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);

  const watchedStocks = (process.env.WATCHED_STOCKS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const watchedCryptos = (process.env.WATCHED_CRYPTOS || '')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);

  // BSE-listed companies for Bulgaria
  const bseCompanies = [
    'sopharma',
    'first investment bank',
    'eurohold',
    'bulgarian energy holding',
  ];

  const allWatchedTerms = [
    ...watchedCompanies,
    ...watchedStocks,
    ...watchedCryptos,
    ...bseCompanies,
  ];

  if (allWatchedTerms.length === 0) {
    return { watchlistHits: [], updatedData: allData };
  }

  const watchlistHits = [];

  // Helper function to check if text contains watched terms
  const containsWatchedTerm = (text) => {
    if (!text) return null;
    const lowerText = text.toLowerCase();
    return allWatchedTerms.find(term => lowerText.includes(term));
  };

  // Process all data sources
  const updatedData = { ...allData };

  // Early bird items
  if (allData.earlyBirdItems) {
    updatedData.earlyBirdItems = allData.earlyBirdItems.map(item => {
      const matchedTerm = containsWatchedTerm(`${item.title} ${item.description}`);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: item.signals?.join(', ') || 'Mention',
          source: item.source,
          signalTier: item.tier,
          url: item.url,
          pubDate: item.pubDate,
        });
      }
      return item;
    });
  }

  // Central bank items
  if (allData.centralBankItems) {
    updatedData.centralBankItems = allData.centralBankItems.map(item => {
      const matchedTerm = containsWatchedTerm(`${item.title} ${item.description}`);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: item.signals?.join(', ') || 'Mention',
          source: item.source,
          signalTier: item.tier,
          url: item.url,
          pubDate: item.pubDate,
        });
      }
      return item;
    });
  }

  // Regional items
  if (allData.regionalItems) {
    updatedData.regionalItems = allData.regionalItems.map(item => {
      const matchedTerm = containsWatchedTerm(`${item.title} ${item.description}`);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: item.signals?.join(', ') || 'Mention',
          source: item.source,
          region: item.region,
          signalTier: item.tier,
          url: item.url,
          pubDate: item.pubDate,
        });
      }
      return item;
    });
  }

  // News items
  ['globalNews', 'techNews', 'economyNews', 'regionalNews'].forEach(key => {
    if (allData[key]) {
      updatedData[key] = allData[key].map(item => {
        const matchedTerm = containsWatchedTerm(`${item.title} ${item.description}`);
        if (matchedTerm) {
          item.isWatchlistHit = true;
          watchlistHits.push({
            company: matchedTerm,
            signal: 'News mention',
            source: item.source,
            region: item.region,
            url: item.url,
            pubDate: item.pubDate,
          });
        }
        return item;
      });
    }
  });

  // Contracts
  if (allData.contracts) {
    updatedData.contracts = allData.contracts.map(item => {
      const matchedTerm = containsWatchedTerm(item.title);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: `Contract (${item.signalTier})`,
          source: item.source,
          url: item.url,
          pubDate: item.postedDate,
        });
      }
      return item;
    });
  }

  // EDGAR filings
  if (allData.edgarFilings) {
    updatedData.edgarFilings = allData.edgarFilings.map(item => {
      const matchedTerm = containsWatchedTerm(item.companyName);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: `SEC ${item.filingType}`,
          source: item.source,
          url: item.url,
          pubDate: item.filingDate,
        });
      }
      return item;
    });
  }

  // Deduplicate watchlist hits by URL
  const uniqueHits = [];
  const seenUrls = new Set();
  
  watchlistHits.forEach(hit => {
    if (!seenUrls.has(hit.url)) {
      seenUrls.add(hit.url);
      uniqueHits.push(hit);
    }
  });

  return {
    watchlistHits: uniqueHits,
    updatedData,
  };
}

// ─── Phase 4: Signal Filter Functions ────────────────────────────────────────

const BREAKING_KEYWORDS = [
  'explosion', 'earthquake', 'shooting', 'attack', 'protest', 'strike',
  'emergency', 'evacuation', 'outbreak', 'cyberattack', 'sanctions',
  'collapse', 'riot', 'fire', 'flooding', 'bombing', 'assassination',
  'coup', 'invasion', 'hostage',
];

const GDELT_HIGH_PREFIXES = ['14', '17', '18', '19', '20'];
const GDELT_HIGH_CODES = ['0211', '0231', '0311', '1011', '1031'];

/**
 * Filter GDELT events — keep only high-signal events, return top 200 by score
 */
export function filterGDELT(events) {
  if (!events || events.length === 0) return [];

  return events
    .filter(e => {
      // Rule 1: Negative tone
      if (e.tone >= -1) return false;
      // Rule 2: High-priority CAMEO codes OR keyword match
      const catMatch = GDELT_HIGH_PREFIXES.some(p => e.category.startsWith(p)) ||
                       GDELT_HIGH_CODES.includes(e.category);
      const text = `${e.title} ${e.summary}`.toLowerCase();
      const hasKeyword = BREAKING_KEYWORDS.some(kw => text.includes(kw));
      // Keep if EITHER category matches OR keyword matches
      if (!catMatch && !hasKeyword) return false;
      return true;
    })
    .map(e => {
      // Rule 4: Severity scoring
      const isHighPriority = GDELT_HIGH_PREFIXES.some(p => e.category.startsWith(p)) ||
                             GDELT_HIGH_CODES.includes(e.category);
      e.score = 50 + (Math.abs(e.tone) * 2) + ((e.numMentions || 0) * 0.5) + (isHighPriority ? 20 : 0);
      return e;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 200); // cap before cross-source dedup to keep RAM and CPU reasonable
}

const PRESS_HIGH_KEYWORDS = [
  'acquisition', 'acquires', 'merger', 'merges', 'takeover',
  'bankruptcy', 'chapter 11', 'restructuring',
  'fda approval', 'fda clears', 'clinical trial', 'phase 1', 'phase 2', 'phase 3',
  'sec charges', 'sec investigation', 'ftc', 'doj', 'antitrust',
  'class action', 'settlement', 'indictment',
  'data breach', 'cybersecurity', 'ransomware', 'hack',
  'recall', 'profit warning', 'guidance cut',
  'layoffs', 'workforce reduction'
];
const PRESS_MEDIUM_KEYWORDS = [
  'earnings', 'quarterly results', 'revenue', 'guidance', 'forecast',
  'ipo', 'listing', 'delisting',
  'funding', 'raises $', 'series a', 'series b', 'series c',
  'contract', 'government contract', 'award',
  'supply chain', 'production', 'facility closure',
  'ceo resigns', 'cfo resigns', 'leadership change',
  'strategic alliance', 'joint venture', 'partnership'
];
const PRESS_LOW_KEYWORDS = [
  'appoints', 'names ceo', 'names cfo', 'expands',
  'new product', 'launch'
];
const PRESS_NEGATIVE_KEYWORDS = [
  'valentine', 'holiday', 'christmas', 'black friday',
  'influencer', 'beauty brand', 'skincare', 'fragrance',
  'fashion', 'apparel', 'footwear', 'sneakers',
  'survey', 'study finds', 'report shows',
  'award', 'ranking', 'best workplace',
  'grand opening', 'store opening',
  'promo', 'promotion', 'discount', 'sale',
  'celebrates', 'anniversary'
];

/**
 * Filter press release item — returns boolean pass/fail
 */
export function filterPress(item, watchlistCompanies = []) {
  const text = (item.title + ' ' + item.summary).toLowerCase();

  // 1. Hard reject if negative keyword appears
  if (PRESS_NEGATIVE_KEYWORDS.some(k => text.includes(k))) {
    return false;
  }

  let score = 0;

  // 2. High-value keywords → strong signal
  if (PRESS_HIGH_KEYWORDS.some(k => text.includes(k))) {
    score += 5;
  }

  // 3. Medium-value keywords → moderate signal
  if (PRESS_MEDIUM_KEYWORDS.some(k => text.includes(k))) {
    score += 3;
  }

  // 4. Low-value keywords → weak signal
  if (PRESS_LOW_KEYWORDS.some(k => text.includes(k))) {
    score += 1;
  }

  // 5. Company name boost (only if in watchlist)
  for (const company of watchlistCompanies) {
    if (company && text.includes(company.toLowerCase())) {
      score += 2;
    }
  }

  // 6. Final decision threshold
  //    - High keyword alone passes (score >= 5)
  //    - Medium keyword + company name passes (>= 5)
  //    - Low keyword alone does NOT pass
  //    - No keyword → reject
  return score >= 5;
}

/**
 * Filter press releases array — wrapper for filterPress
 */
export function filterPressReleases(events, watchlistCompanies = []) {
  if (!events || events.length === 0) return [];
  return events.filter(e => filterPress(e, watchlistCompanies));
}

const REDDIT_NOISE = [
  'giveaway', 'follow me', 'click here', 'rt to win',
  'discount', 'promo', 'subscribe', '#ad', '#sponsored',
];

/**
 * Filter Reddit posts — keep only high-signal breaking posts
 */
export function filterReddit(events) {
  if (!events || events.length === 0) return [];

  return events
    .filter(e => {
      const text = e.summary.toLowerCase();
      // Remove noise
      if (REDDIT_NOISE.some(n => text.includes(n))) return false;
      if (e.summary.length < 30) return false;
      if ((text.match(/#/g) || []).length > 5) return false;
      return true;
    })
    .map(e => {
      const text = e.summary.toLowerCase();
      let score = 10;
      const upvoteCount = e.score || 0; // score is initially post upvotes
      score += upvoteCount > 1000 ? 40 : upvoteCount > 100 ? 20 : 5;
      const keywordHits = BREAKING_KEYWORDS.filter(kw => text.includes(kw)).length;
      score += keywordHits * 10;
      e.score = score;
      return e;
    })
    .filter(e => e.score >= 20);
}

const GNEWS_KEYWORDS = [
  'breaking', 'urgent', 'alert', 'update', 'developing',
  'crash', 'death', 'killed', 'attack', 'fire', 'explosion',
  'earthquake', 'flood', 'hurricane', 'strike', 'protest',
  'arrest', 'indicted', 'banned', 'crisis', 'emergency',
  'collapse', 'hack', 'breach', 'recall', 'shutdown',
];

/**
 * Filter Google News — keep breaking/high-impact headlines
 */
export function filterGoogleNews(events) {
  if (!events || events.length === 0) return [];

  return events
    .map(e => {
      const titleLower = e.title.toLowerCase();
      const matchingKws = GNEWS_KEYWORDS.filter(kw => titleLower.includes(kw));
      if (matchingKws.length === 0) return null;

      let score = 30;
      if (titleLower.includes('breaking') || titleLower.includes('urgent')) score += 20;
      score += matchingKws.length * 5;
      e.score = score;
      return e;
    })
    .filter(Boolean);
}

// ─── Cross-Source Confirmation & Deduplication ───────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'of',
  'for', 'and', 'or', 'but', 'not', 'by', 'with', 'from', 'has', 'had', 'have',
  'this', 'that', 'it', 'its', 'be', 'been', 'as', 'will', 'can',
]);

/**
 * Cross-source confirmation: boost score when same event seen in 2+ sources.
 * Uses an inverted fingerprint index for O(n) lookup instead of O(n²) comparison.
 */
export function crossSourceConfirm(allEvents) {
  if (!allEvents || allEvents.length < 2) return allEvents || [];

  // Build fingerprint → [event indices] index
  const wordIndex = new Map(); // word → Set of event indices

  const fingerprints = allEvents.map((event, i) => {
    const words = event.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => !STOPWORDS.has(w) && w.length > 2)
      .slice(0, 3);

    for (const word of words) {
      if (!wordIndex.has(word)) wordIndex.set(word, []);
      wordIndex.get(word).push(i);
    }
    return words;
  });

  const BONUS_MAP = {
    'gdelt+rss': 50, 'rss+gdelt': 50,
    'gdelt+googlenews': 50, 'googlenews+gdelt': 50,
    'press+googlenews': 40, 'googlenews+press': 40,
    'press+rss': 40, 'rss+press': 40,
    'reddit+gdelt': 60, 'gdelt+reddit': 60,
    'reddit+googlenews': 50, 'googlenews+reddit': 50,
  };

  // For each event, find candidates that share at least one fingerprint word
  for (let i = 0; i < allEvents.length; i++) {
    const candidates = new Set();
    for (const word of fingerprints[i]) {
      for (const j of wordIndex.get(word) || []) {
        if (j > i) candidates.add(j); // only check each pair once
      }
    }

    for (const j of candidates) {
      if (allEvents[i].source === allEvents[j].source) continue;

      // Count shared fingerprint words with event j's title
      const titleJ = allEvents[j].title.toLowerCase();
      const matchCount = fingerprints[i].filter(w => titleJ.includes(w)).length;

      if (matchCount >= 2) {
        allEvents[i].confirmed = true;
        allEvents[j].confirmed = true;

        const pairKey = `${allEvents[i].source}+${allEvents[j].source}`;
        const bonus = BONUS_MAP[pairKey] || 30;
        allEvents[i].score += bonus;
        allEvents[j].score += bonus;
      }
    }
  }

  return allEvents;
}

/**
 * Deduplicate events: same URL, same ID, or very similar titles across sources
 */
export function deduplicateEvents(events) {
  if (!events || events.length === 0) return [];

  // Sort by score descending first so we keep the highest-scoring version
  const sorted = [...events].sort((a, b) => b.score - a.score);
  const kept = [];
  const keptWordSets = []; // precomputed word sets for kept items
  const seenUrls = new Set();
  const seenIds = new Set();

  for (const event of sorted) {
    // Rule 1: Same URL
    if (seenUrls.has(event.url)) continue;
    // Rule 2: Same ID
    if (seenIds.has(event.id)) continue;

    // Rule 3: Title similarity across different sources within 2 hours
    const eventWords = new Set(event.title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const isDuplicate = kept.some((existing, idx) => {
      if (existing.source === event.source) return false;
      const timeDiff = Math.abs(existing.timestamp - event.timestamp);
      if (timeDiff > 2 * 60 * 60 * 1000) return false;
      return titleSimilarityFromSets(keptWordSets[idx], eventWords) > 0.8;
    });

    if (isDuplicate) continue;

    seenUrls.add(event.url);
    seenIds.add(event.id);
    kept.push(event);
    keptWordSets.push(eventWords);
  }

  return kept;
}

function titleSimilarityFromSets(wordsA, wordsB) {
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  const total = new Set([...wordsA, ...wordsB]).size;
  if (total === 0) return 0;
  const shared = [...wordsA].filter(w => wordsB.has(w)).length;
  return shared / total;
}

// ─── Master Orchestrator ─────────────────────────────────────────────────────

/**
 * Build the ranked signal list from all Phase 4 sources
 * @returns {Promise<Array>} Filtered, scored, confirmed, deduplicated events
 */
export async function buildSignalList() {
  console.info('[SIGNALS] Building signal list from all sources...');

  const [gdeltRaw, pressRaw, redditRaw, gnewsRaw] = await Promise.allSettled([
    fetchGDELT(),
    fetchPressReleases(),
    fetchRedditBreaking(),
    fetchGoogleNews(),
  ]);

  const gdeltEvents = gdeltRaw.status === 'fulfilled' ? gdeltRaw.value : [];
  const pressEvents = pressRaw.status === 'fulfilled' ? pressRaw.value : [];
  const redditEvents = redditRaw.status === 'fulfilled' ? redditRaw.value : [];
  const gnewsEvents = gnewsRaw.status === 'fulfilled' ? gnewsRaw.value : [];

  console.info('[SIGNALS] Raw counts:', {
    gdelt: gdeltEvents.length,
    press: pressEvents.length,
    reddit: redditEvents.length,
    googlenews: gnewsEvents.length,
  });

  // Filter each source
  const gdeltFiltered = filterGDELT(gdeltEvents);
  const pressFiltered = filterPressReleases(pressEvents);
  const redditFiltered = filterReddit(redditEvents);
  const gnewsFiltered = filterGoogleNews(gnewsEvents);

  console.info('[SIGNALS] Filtered counts:', {
    gdelt: gdeltFiltered.length,
    press: pressFiltered.length,
    reddit: redditFiltered.length,
    googlenews: gnewsFiltered.length,
  });

  // Merge
  const all = [...gdeltFiltered, ...pressFiltered, ...redditFiltered, ...gnewsFiltered];

  // Cross-source confirm
  const confirmed = crossSourceConfirm(all);

  // Deduplicate and sort
  const final = deduplicateEvents(confirmed);

  console.info(`[SIGNALS] Final signal list: ${final.length} events (${final.filter(e => e.confirmed).length} confirmed)`);
  return final;
}
