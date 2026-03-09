const BREAKING_KEYWORDS = [
  'explosion', 'earthquake', 'shooting', 'attack', 'strike',
  'protest', 'emergency', 'evacuation', 'outbreak',
  'cyberattack', 'sanctions', 'collapse', 'riot', 'flood',
  'bombing', 'assassination', 'coup', 'invasion', 'hostage',
];

const REDDIT_NEGATIVE = [
  'meme', 'funny', 'joke', 'opinion', 'discussion',
  'sports', 'football', 'nba', 'nfl', 'soccer',
  'celebrity', 'gossip', 'trailer', 'movie', 'tv show',
  'reddit', 'meta', 'mod', 'rules',
];

const SUBREDDITS = [
  'news',
  'worldnews',
  'geopolitics',
  'europe',
  'UkraineWarVideoReport',
  'BreakingNews',
];

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const REDDIT_USERNAME = process.env.REDDIT_USERNAME;
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD;
const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'IntelligenceNewsletter/1.0 by u/your_reddit_username';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function hasRedditCredentials() {
  return Boolean(REDDIT_CLIENT_ID && REDDIT_CLIENT_SECRET && REDDIT_USERNAME && REDDIT_PASSWORD);
}

function getBasicAuthHeader() {
  const auth = `${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(auth).toString('base64')}`;
}

async function getRedditAccessToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedAccessToken && now < cachedAccessTokenExpiresAt) {
    return cachedAccessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    username: REDDIT_USERNAME,
    password: REDDIT_PASSWORD,
  });

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed: HTTP ${response.status}`);
  }

  const tokenJson = await response.json();
  const accessToken = tokenJson.access_token;
  const expiresIn = Number(tokenJson.expires_in || 3600);

  if (!accessToken) {
    throw new Error('OAuth token response missing access_token');
  }

  // Refresh 60s early to avoid edge expirations.
  cachedAccessToken = accessToken;
  cachedAccessTokenExpiresAt = Date.now() + Math.max(expiresIn - 60, 60) * 1000;
  return cachedAccessToken;
}

async function fetchSubredditNew(subreddit, accessToken) {
  const url = `https://oauth.reddit.com/r/${subreddit}/new?limit=25&raw_json=1`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': REDDIT_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.data?.children || [];
}

/**
 * Fetch breaking news posts from Reddit (no API key required)
 * @returns {Promise<Array>} Normalized event objects
 */
export async function fetchRedditBreaking() {
  console.info('[REDDIT] Fetching breaking news posts...');

  if (!hasRedditCredentials()) {
    console.info('[REDDIT] Missing script app credentials; skipping');
    return [];
  }

  try {
    let accessToken = await getRedditAccessToken();
    const events = [];

    for (const sub of SUBREDDITS) {
      let posts = [];
      try {
        posts = await fetchSubredditNew(sub, accessToken);
      } catch (error) {
        // Retry once with a refreshed token on auth failures.
        if (String(error.message || '').includes('401') || String(error.message || '').includes('403')) {
          try {
            accessToken = await getRedditAccessToken(true);
            posts = await fetchSubredditNew(sub, accessToken);
          } catch (retryError) {
            console.warn(`[REDDIT] Failed for r/${sub}: ${retryError.message}`);
            continue;
          }
        } else {
          console.warn(`[REDDIT] Failed for r/${sub}: ${error.message}`);
          continue;
        }
      }

      for (const p of posts) {
        const post = p.data;
        const text = `${post.title} ${post.selftext || ''}`.toLowerCase();

        // Negative filter
        if (REDDIT_NEGATIVE.some(k => text.includes(k))) continue;

        // Must match at least one breaking keyword
        if (!BREAKING_KEYWORDS.some(k => text.includes(k))) continue;

        events.push({
          id: `reddit_${post.id}`,
          source: 'reddit',
          title: post.title.slice(0, 100),
          summary: post.selftext || post.title,
          url: `https://www.reddit.com${post.permalink}`,
          timestamp: new Date(post.created_utc * 1000),
          tone: 0,
          category: 'reddit',
          score: post.ups || 0,
          confirmed: false,
        });
      }
    }

    console.info(`[REDDIT] Fetched ${events.length} breaking posts`);
    return events;
  } catch (error) {
    console.error('[REDDIT] Fetch failed:', error.message);
    return [];
  }
}

// Compatibility export so existing imports of fetchTweets keep working.
export const fetchTweets = fetchRedditBreaking;
export default fetchRedditBreaking;
