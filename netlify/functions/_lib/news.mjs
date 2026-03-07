/**
 * Bing Search API — General news headlines
 * Fetches global, technology, economy, and regional news
 */

const BING_API_KEY = process.env.BING_SEARCH_API_KEY;
const BING_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/news/search';

/**
 * Fetch news from Bing Search
 * @returns {Promise<object>} { globalNews, techNews, economyNews, regionalNews }
 */
export default async function fetchNews() {
  if (!BING_API_KEY) {
    console.warn('[NEWS] BING_SEARCH_API_KEY not set, skipping Bing news');
    return { globalNews: [], techNews: [], economyNews: [], regionalNews: [] };
  }

  const regions = (process.env.WATCHED_REGIONS || '')
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);

  const queries = [
    { key: 'globalNews', query: 'breaking news' },
    { key: 'techNews', query: 'technology news' },
    { key: 'economyNews', query: 'economy markets business news' },
  ];

  // Add regional queries
  const regionNames = {
    BG: 'Bulgaria',
    EU: 'European Union',
    NATO: 'NATO',
    DE: 'Germany',
    FR: 'France',
    UK: 'United Kingdom',
    US: 'United States',
  };

  for (const region of regions) {
    const regionName = regionNames[region.toUpperCase()];
    if (regionName) {
      queries.push({
        key: `regional_${region}`,
        query: `${regionName} news`,
        region: region.toUpperCase(),
      });
    }
  }

  try {
    const results = await Promise.allSettled(
      queries.map(q => fetchBingNews(q.query, q.region))
    );

    const output = {
      globalNews: [],
      techNews: [],
      economyNews: [],
      regionalNews: [],
    };

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const { key, region } = queries[idx];
        const items = result.value;

        if (key.startsWith('regional_')) {
          output.regionalNews.push(...items.map(item => ({ ...item, region })));
        } else {
          output[key] = items;
        }
      }
    });

    return output;
  } catch (error) {
    console.error('[NEWS] Bing fetch failed:', error.message);
    return { globalNews: [], techNews: [], economyNews: [], regionalNews: [] };
  }
}

/**
 * Fetch from Bing News API
 */
async function fetchBingNews(query, region = null) {
  const url = new URL(BING_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', '10');
  url.searchParams.set('freshness', 'Day');
  url.searchParams.set('mkt', 'en-US');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': BING_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Bing API error: ${response.status}`);
    }

    const data = await response.json();
    
    return (data.value || [])
      .filter(item => item.url)
      .map(item => ({
        title: item.name,
        description: item.description,
        url: item.url,
        source: item.provider?.[0]?.name || 'Bing News',
        pubDate: item.datePublished,
        region,
      }));
  } catch (error) {
    console.error(`[NEWS] Bing query "${query}" failed:`, error.message);
    return [];
  }
}
