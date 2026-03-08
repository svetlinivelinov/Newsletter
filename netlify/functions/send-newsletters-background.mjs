import fetchNews from './_lib/news.mjs';
import fetchRSS from './_lib/rss.mjs';
import fetchRegionalFeeds from './_lib/regional.mjs';
import fetchMacro from './_lib/macro.mjs';
import fetchContracts from './_lib/contracts.mjs';
import fetchEdgarFilings from './_lib/edgar.mjs';
import fetchCryptoSignals from './_lib/crypto.mjs';
import fetchMarketSignals from './_lib/market.mjs';
import applyWatchlist, { buildSignalList } from './_lib/watchlist.mjs';
import generateContent from './_lib/ai.mjs';
import { sendDigest } from './_lib/email.mjs';
import { listSubscribers, getStats, saveStats } from './_lib/db.mjs';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * CRON: Daily digest at 07:00 UTC
 * Triggered by Netlify scheduled function
 */
export const handler = async (event) => {
  // Allow Netlify's own scheduler (body contains next_run) OR manual trigger with x-cron-secret header
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
  const isScheduledByNetlify = typeof body.next_run === 'string';

  if (!isScheduledByNetlify) {
    const cronSecret = event.headers?.['x-cron-secret'];
    if (!cronSecret || cronSecret !== CRON_SECRET) {
      console.error('[DIGEST] Unauthorized cron attempt');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }),
      };
    }
  }

  console.info('[DIGEST] Starting daily digest generation...');
  const startTime = Date.now();

  try {
    // Fetch all data sources in parallel
    console.info('[DIGEST] Fetching data from all sources...');
    
    const [
      newsResult,
      rssResult,
      regionalResult,
      macroResult,
      contractsResult,
      edgarResult,
      cryptoResult,
      marketResult,
    ] = await Promise.allSettled([
      fetchNews(),
      fetchRSS(),
      fetchRegionalFeeds(),
      fetchMacro(),
      fetchContracts(),
      fetchEdgarFilings(),
      fetchCryptoSignals(),
      fetchMarketSignals(),
    ]);

    // Extract successful results
    const newsData = newsResult.status === 'fulfilled' ? newsResult.value : { globalNews: [], techNews: [], economyNews: [], regionalNews: [] };
    const rssData = rssResult.status === 'fulfilled' ? rssResult.value : { earlyBirdItems: [], centralBankItems: [] };
    const regionalData = regionalResult.status === 'fulfilled' ? regionalResult.value : { regionalItems: [] };
    const macroData = macroResult.status === 'fulfilled' ? macroResult.value : { indicators: [], upcomingReleases: [] };
    const contractsData = contractsResult.status === 'fulfilled' ? contractsResult.value : [];
    const edgarData = edgarResult.status === 'fulfilled' ? edgarResult.value : [];
    const cryptoData = cryptoResult.status === 'fulfilled' ? cryptoResult.value : [];
    const marketData = marketResult.status === 'fulfilled' ? marketResult.value : [];

    console.info('[DIGEST] Data collection complete:', {
      news: newsData.globalNews?.length || 0,
      rss: rssData.earlyBirdItems?.length || 0,
      regional: regionalData.regionalItems?.length || 0,
      macro: macroData.indicators?.length || 0,
      contracts: contractsData.length || 0,
      edgar: edgarData.length || 0,
      crypto: cryptoData.length || 0,
      market: marketData.length || 0,
    });

    // Combine all data
    const allData = {
      ...newsData,
      ...rssData,
      ...regionalData,
      indicators: macroData.indicators,
      upcomingReleases: macroData.upcomingReleases,
      contracts: contractsData,
      edgarFilings: edgarData,
      cryptoSignals: cryptoData,
      marketSignals: marketData,
    };

    // Apply watchlist filtering
    console.info('[DIGEST] Applying watchlist filters...');
    const { watchlistHits, updatedData } = applyWatchlist(allData);
    updatedData.watchlistHits = watchlistHits;

    console.info('[DIGEST] Watchlist hits:', watchlistHits.length);

    // Check if we have any data
    const hasData = Object.values(updatedData).some(value => {
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(v => Array.isArray(v) ? v.length > 0 : false);
      }
      return false;
    });

    if (!hasData) {
      console.warn('[DIGEST] No data to send, aborting');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true, 
          message: 'No data to send',
          sent: 0,
        }),
      };
    }

    // Fetch Phase 4 intelligence signals
    console.info('[DIGEST] Building intelligence signal list...');
    let signals = [];
    try {
      signals = await buildSignalList();
      console.info(`[DIGEST] Got ${signals.length} signals (${signals.filter(s => s.confirmed).length} confirmed)`);
    } catch (err) {
      console.error('[DIGEST] Signal list failed (non-fatal):', err.message);
    }
    updatedData.signals = signals;

    // Generate newsletter content
    console.info('[DIGEST] Generating AI content...');
    const htmlContent = await generateContent('digest', updatedData);

    // Load subscribers
    console.info('[DIGEST] Loading subscribers...');
    const subscribers = await listSubscribers();
    
    if (subscribers.length === 0) {
      console.warn('[DIGEST] No active subscribers');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true, 
          message: 'No active subscribers',
          sent: 0,
        }),
      };
    }

    console.info(`[DIGEST] Sending to ${subscribers.length} subscribers...`);

    // Send to all subscribers
    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const subscriber of subscribers) {
      try {
        const result = await sendDigest(subscriber.email, htmlContent);
        
        if (result.success) {
          sent++;
        } else {
          failed++;
          errors.push({ email: subscriber.email, error: result.error });
          console.error(`[DIGEST] Failed to send to ${subscriber.email}:`, result.error);
        }
      } catch (error) {
        failed++;
        errors.push({ email: subscriber.email, error: error.message });
        console.error(`[DIGEST] Failed to send to ${subscriber.email}:`, error.message);
      }
      // Resend free tier: max 2 req/s — wait 1s between sends to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));
    }

    // saveStats is a no-op with Resend Contacts backend — skip to avoid rate limit

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.info(`[DIGEST] Complete in ${duration}s - Sent: ${sent}, Failed: ${failed}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        sent,
        failed,
        duration: `${duration}s`,
        errors: errors.slice(0, 10), // Return first 10 errors
      }),
    };
  } catch (error) {
    console.error('[DIGEST] Fatal error:', error.message);
    console.error(error.stack);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        code: 'INTERNAL_ERROR',
        message: error.message,
      }),
    };
  }
};
