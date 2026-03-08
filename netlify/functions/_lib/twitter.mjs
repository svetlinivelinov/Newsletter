const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;

const BREAKING_KEYWORDS = [
  'breaking', 'explosion', 'earthquake', 'shooting', 'attack',
  'protest', 'strike', 'emergency', 'evacuation', 'outbreak',
  'cyberattack', 'sanctions', 'collapse', 'riot', 'flooding',
  'bombing', 'assassination', 'coup', 'invasion', 'hostage',
];

/**
 * Fetch recent tweets matching breaking-news keywords via Twitter API v2
 * Returns empty array if TWITTER_BEARER_TOKEN is not set
 * @returns {Promise<Array>} Normalized event objects
 */
export async function fetchTweets() {
  if (!TWITTER_BEARER_TOKEN) {
    console.info('[TWITTER] No bearer token set, skipping');
    return [];
  }

  try {
    console.info('[TWITTER] Fetching recent breaking news tweets...');

    const query = `(${BREAKING_KEYWORDS.slice(0, 10).join(' OR ')}) -is:retweet lang:en`;

    const url = new URL('https://api.twitter.com/2/tweets/search/recent');
    url.searchParams.set('query', query);
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id');
    url.searchParams.set('max_results', '50');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
        'User-Agent': 'IntelligenceNewsletter/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Twitter API HTTP ${response.status}: ${await response.text()}`);
    }

    const json = await response.json();
    const tweets = json.data || [];

    const events = tweets.map(tweet => ({
      id: `twitter_${tweet.id}`,
      source: 'twitter',
      title: tweet.text.slice(0, 100),
      summary: tweet.text,
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      timestamp: new Date(tweet.created_at),
      tone: 0,
      category: 'tweet',
      score: tweet.public_metrics?.retweet_count || 0,
      confirmed: false,
    }));

    console.info(`[TWITTER] Fetched ${events.length} tweets`);
    return events;
  } catch (error) {
    console.error('[TWITTER] Fetch failed:', error.message);
    return [];
  }
}

export default fetchTweets;
