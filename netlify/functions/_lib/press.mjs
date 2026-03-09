import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

const PRESS_FEEDS = [
  { name: 'PRNewswire', url: 'https://www.prnewswire.com/rss/news-releases-list.rss' },
  { name: 'BusinessWire', url: 'https://feed.businesswire.com/rss/home/?rss=G1' },
  { name: 'GlobeNewswire', url: 'https://www.globenewswire.com/RssFeed/subjectcode/15-Financial' },
];

/**
 * Fetch press releases from major wire services
 * @returns {Promise<Array>} Normalized event objects
 */
export async function fetchPressReleases() {
  try {
    console.info('[PRESS] Fetching press release feeds...');

    const results = await Promise.allSettled(
      PRESS_FEEDS.map(feed => fetchPressFeed(feed))
    );

    const allItems = [];
    const seenUrls = new Set();

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        for (const item of result.value) {
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            allItems.push(item);
          }
        }
      } else if (result.status === 'rejected') {
        console.error(`[PRESS] ${PRESS_FEEDS[idx].name} failed:`, result.reason?.message);
      }
    });

    console.info(`[PRESS] Fetched ${allItems.length} press releases`);
    return allItems;
  } catch (error) {
    console.error('[PRESS] Fetch failed:', error.message);
    return [];
  }
}

/**
 * Fetch a single press release feed
 */
async function fetchPressFeed(feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IntelligenceBot/1.0)',
      },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`${feed.name} HTTP ${response.status}`);

    const xml = await response.text();
    const data = parser.parse(xml);

    const channel = data.rss?.channel || data.feed;
    if (!channel) return [];

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);
    const entries = Array.isArray(channel.entry) ? channel.entry : [channel.entry].filter(Boolean);
    const allItems = [...items, ...entries];

    return allItems
      .filter(item => item.link || item.id)
      .map(item => {
        const title = item.title?.toString() || '';
        const description = stripHtml(item.description?.toString() || item.summary?.toString() || '');
        const link = typeof item.link === 'string' ? item.link : (item.link?.href || item.id || '');
        const pubDate = item.pubDate || item.published || item.updated;

        return {
          id: `press_${simpleHash(link)}`,
          source: 'press',
          title,
          summary: description.slice(0, 500),
          url: link,
          timestamp: pubDate ? new Date(pubDate) : new Date(),
          tone: 0,
          category: 'press_release',
          score: 0,
          confirmed: false,
        };
      });
  } catch (error) {
    console.error(`[PRESS] Feed ${feed.name} failed:`, error.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Strip HTML tags from a string */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Simple hash for dedup IDs */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export default fetchPressReleases;
