import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

// Regional feed registry
const REGIONAL_FEED_REGISTRY = {
  BG: [
    { name: 'Deutsche Welle Europe', url: 'https://www.dw.com/en/top-stories/s-9097', tier: 'national_news' },
    { name: 'VOA Europe', url: 'https://www.voanews.com/api/epiqq', tier: 'national_news' },
    { name: 'SeeNews Bulgaria', url: 'https://seenews.com/rss/bulgaria', tier: 'financial' },
    { name: 'Balkan Insight', url: 'https://balkaninsight.com/feed/', tier: 'regional_news' },
  ],
  EU: [
    { name: 'EC Press Releases', url: 'https://ec.europa.eu/commission/presscorner/api/rss', tier: 'regulatory' },
    { name: 'Financial Times', url: 'https://www.ft.com/?format=rss', tier: 'regulatory' },
    { name: 'SeeNews Bulgaria', url: 'https://seenews.com/rss/bulgaria', tier: 'regulatory' },
    { name: 'Balkan Insight', url: 'https://balkaninsight.com/feed/', tier: 'policy_news' },
  ],
  NATO: [
    { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', tier: 'defence' },
    { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/', tier: 'defence' },
    { name: 'Breaking Defense', url: 'https://breakingdefense.com/feed/', tier: 'defence' },
    { name: 'Balkan Insight', url: 'https://balkaninsight.com/feed/', tier: 'defence' },
  ],
  DE: [
    { name: 'Deutsche Welle Business', url: 'https://rss.dw.com/rdf/rss-en-bus', tier: 'national_news' },
  ],
  UK: [
    { name: 'Bank of England', url: 'https://www.bankofengland.co.uk/rss/news', tier: 'central_bank' },
  ],
};

// Bulgaria-specific signal keywords
const BG_SIGNAL_KEYWORDS = {
  EURO_ADOPTION: ['euro adoption', 'erm ii', 'eurozone', 'lev', 'bgn'],
  ENERGY_TRANSIT: ['gas pipeline', 'turkstream', 'energy corridor', 'bulgartransgaz'],
  EU_FUNDS: ['cohesion fund', 'eu funds', 'structural funds', 'recovery plan'],
  BANKING: ['bnb', 'bulgarian national bank', 'banking sector', 'dsk', 'unicredit bulbank'],
  BSE_LISTED: ['sopharma', 'first investment bank', 'eurohold', 'bulgarian energy holding'],
  RULE_OF_LAW: ['corruption', 'rule of law', 'judicial reform', 'olaf'],
};

// NATO/Defence-specific signal keywords
const NATO_SIGNAL_KEYWORDS = {
  DEFENCE_CONTRACT: ['contract award', 'procurement', 'billion', 'defence spending'],
  ALLIANCE_NEWS: ['article 5', 'collective defence', 'enlargement', 'accession'],
  EXERCISE: ['military exercise', 'nato exercise', 'joint exercise'],
};

// General signal keywords
const SIGNAL_KEYWORDS = {
  MERGER_ACQUISITION: ['acquires', 'acquisition', 'merger', 'takeover'],
  REGULATORY_ACTION: ['antitrust', 'fine', 'ban', 'sanction'],
  GEOPOLITICAL: ['sanctions', 'tariff', 'trade war', 'conflict'],
};

/**
 * Fetch regional RSS feeds based on WATCHED_REGIONS
 * @returns {Promise<object>} { regionalItems }
 */
export default async function fetchRegionalFeeds() {
  const regionsEnv = process.env.WATCHED_REGIONS || '';
  const activeRegions = regionsEnv
    .split(',')
    .map(r => r.trim().toUpperCase())
    .filter(Boolean);

  if (activeRegions.length === 0) {
    return { regionalItems: [] };
  }

  // Collect all feeds for active regions
  const feedsToFetch = [];
  for (const region of activeRegions) {
    const feeds = REGIONAL_FEED_REGISTRY[region];
    if (feeds) {
      feeds.forEach(feed => {
        feedsToFetch.push({ ...feed, region });
      });
    }
  }

  // Add extra RSS feeds if configured
  const extraFeeds = (process.env.EXTRA_RSS_FEEDS || '')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);

  extraFeeds.forEach(url => {
    feedsToFetch.push({
      name: 'Custom Feed',
      url,
      tier: 'custom',
      region: 'CUSTOM',
    });
  });

  if (feedsToFetch.length === 0) {
    return { regionalItems: [] };
  }

  const yesterday = Date.now() - 24 * 60 * 60 * 1000;

  try {
    const results = await Promise.allSettled(
      feedsToFetch.map((feed, idx) => 
        // Add small delay between requests
        new Promise(resolve => 
          setTimeout(() => resolve(fetchFeed(feed, yesterday, activeRegions)), idx * 100)
        )
      )
    );

    const regionalItems = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        regionalItems.push(...result.value);
      }
    });

    return { regionalItems };
  } catch (error) {
    console.error('[REGIONAL] Fetch failed:', error.message);
    return { regionalItems: [] };
  }
}

/**
 * Fetch a single regional RSS feed
 */
async function fetchFeed(feed, cutoffTime, activeRegions) {
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
        
        // Detect regional-specific signals
        if (activeRegions.includes('BG')) {
          for (const [signal, keywords] of Object.entries(BG_SIGNAL_KEYWORDS)) {
            if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
              signals.push(signal);
            }
          }
        }

        if (activeRegions.includes('NATO')) {
          for (const [signal, keywords] of Object.entries(NATO_SIGNAL_KEYWORDS)) {
            if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
              signals.push(signal);
            }
          }
        }

        // General signals
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
          region: feed.region,
          tier: feed.tier,
          pubDate: item.pubDate || item.published || item.updated,
          signals,
          isWatchlistHit: false, // Updated by watchlist.mjs
        };
      });
  } catch (error) {
    console.error(`[REGIONAL] Feed ${feed.name} (${feed.region}) failed:`, error.message);
    return [];
  }
}
