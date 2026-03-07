import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

// Signal keywords for detection
const SIGNAL_KEYWORDS = {
  MERGER_ACQUISITION: ['acquires', 'acquisition', 'merger', 'takeover'],
  EARNINGS: ['earnings', 'quarterly results', 'revenue', 'EPS'],
  RATE_DECISION: ['rate decision', 'basis points', 'rate cut', 'rate hike'],
  MAJOR_CONTRACT: ['awarded contract', 'wins contract', 'procurement award'],
  REGULATORY_ACTION: ['SEC charges', 'antitrust', 'fine', 'ban', 'sanction'],
  GEOPOLITICAL: ['sanctions', 'tariff', 'trade war', 'conflict', 'invasion'],
  BANKRUPTCY: ['bankruptcy', 'chapter 11', 'insolvency'],
  EMERGENCY: ['emergency', 'outbreak', 'crisis'],
};

const RSS_FEEDS = [
  { name: 'GlobeNewswire', url: 'https://www.globenewswire.com/RssFeed/industry/9144-technology', tier: 'newswire' },
  { name: 'BusinessWire', url: 'https://feed.businesswire.com/rss/home/?rss=G1', tier: 'newswire' },
  { name: 'PR Newswire', url: 'https://www.prnewswire.com/rss/news-releases-list.rss', tier: 'newswire' },
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', tier: 'central_bank' },
  { name: 'ECB', url: 'https://www.ecb.europa.eu/rss/press.html', tier: 'central_bank' },
  { name: 'BIS', url: 'https://www.bis.org/doclist/cbspeeches.rss', tier: 'central_bank' },
  { name: 'WHO', url: 'https://www.who.int/rss-feeds/news-english.xml', tier: 'geo' },
  { name: 'UN Press', url: 'https://press.un.org/en/rss.xml', tier: 'geo' },
];

/**
 * Fetch all RSS feeds
 * @returns {Promise<object>} { earlyBirdItems, centralBankItems }
 */
export default async function fetchRSS() {
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  
  try {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(feed => fetchFeed(feed, yesterday))
    );

    const earlyBirdItems = [];
    const centralBankItems = [];

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const feed = RSS_FEEDS[idx];
        const items = result.value;

        if (feed.tier === 'central_bank') {
          centralBankItems.push(...items);
        } else {
          earlyBirdItems.push(...items);
        }
      }
    });

    return { earlyBirdItems, centralBankItems };
  } catch (error) {
    console.error('[RSS] Fetch failed:', error.message);
    return { earlyBirdItems: [], centralBankItems: [] };
  }
}

/**
 * Fetch a single RSS feed
 */
async function fetchFeed(feed, cutoffTime) {
  try {
    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IntelligenceBot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const data = parser.parse(xml);
    
    const channel = data.rss?.channel || data.feed;
    if (!channel) return [];

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);
    const entries = Array.isArray(channel.entry) ? channel.entry : [channel.entry].filter(Boolean);
    const allItems = [...items, ...entries];

    return allItems
      .filter(item => {
        const pubDate = item.pubDate || item.published || item.updated;
        if (!pubDate) return false;
        const timestamp = new Date(pubDate).getTime();
        return timestamp >= cutoffTime;
      })
      .filter(item => item.link || item.id)
      .map(item => {
        const title = item.title?.toString() || '';
        const description = item.description?.toString() || item.summary?.toString() || '';
        const text = `${title} ${description}`.toLowerCase();
        
        const signals = [];
        for (const [signal, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
          if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
            signals.push(signal);
          }
        }

        return {
          title,
          description,
          url: item.link || item.id,
          source: feed.name,
          tier: feed.tier,
          pubDate: item.pubDate || item.published || item.updated,
          signals,
          isWatchlistHit: false, // Updated by watchlist.mjs
        };
      });
  } catch (error) {
    console.error(`[RSS] Feed ${feed.name} failed:`, error.message);
    return [];
  }
}
