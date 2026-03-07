/**
 * Finnhub API — Stock market signals
 * Free tier: 60 calls/min
 */

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const DELAY_MS = 100; // Rate limit: 60 calls/min = 1000ms, use 100ms for safety

/**
 * Fetch stock market signals
 * @returns {Promise<Array>} Stock signal items
 */
export default async function fetchMarketSignals() {
  if (!FINNHUB_API_KEY) {
    console.warn('[MARKET] FINNHUB_API_KEY not set, skipping stock signals');
    return [];
  }

  const watchedStocks = (process.env.WATCHED_STOCKS || 'PLTR,MSFT,LMT')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (watchedStocks.length === 0) {
    return [];
  }

  try {
    const results = await Promise.allSettled(
      watchedStocks.map((symbol, idx) => 
        new Promise(resolve => 
          setTimeout(() => resolve(fetchStockData(symbol)), idx * DELAY_MS)
        )
      )
    );

    const stockSignals = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        stockSignals.push(result.value);
      }
    });

    return stockSignals;
  } catch (error) {
    console.error('[MARKET] Fetch failed:', error.message);
    return [];
  }
}

/**
 * Fetch data for a single stock
 */
async function fetchStockData(symbol) {
  try {
    const headers = { 'X-Finnhub-Token': FINNHUB_API_KEY };
    
    // Fetch quote, target price, and earnings calendar
    const [quote, target, earnings, insider] = await Promise.all([
      fetch(`${FINNHUB_BASE}/quote?symbol=${symbol}`, { headers })
        .then(r => r.ok ? r.json() : null),
      fetch(`${FINNHUB_BASE}/stock/price-target?symbol=${symbol}`, { headers })
        .then(r => r.ok ? r.json() : null),
      fetch(`${FINNHUB_BASE}/calendar/earnings?symbol=${symbol}`, { headers })
        .then(r => r.ok ? r.json() : null),
      fetch(`${FINNHUB_BASE}/stock/insider-transactions?symbol=${symbol}`, { headers })
        .then(r => r.ok ? r.json() : null),
    ]);

    if (!quote || !quote.c) {
      throw new Error('No quote data');
    }

    const price = quote.c; // Current price
    const changePercent = quote.dp || 0; // Day change percent
    const analystTarget = target?.targetMean || null;

    // Detect signals
    const signals = [];
    
    // Undervalued vs analyst target
    if (analystTarget && price < analystTarget * 0.85) {
      signals.push('UNDERVALUED_VS_TARGET');
    }

    // Earnings approaching
    if (earnings?.earningsCalendar && earnings.earningsCalendar.length > 0) {
      const nextEarnings = earnings.earningsCalendar[0];
      const earningsDate = new Date(nextEarnings.date);
      const daysUntil = Math.floor((earningsDate - Date.now()) / (1000 * 60 * 60 * 24));
      
      if (daysUntil >= 0 && daysUntil <= 7) {
        signals.push('EARNINGS_APPROACHING');
      }
    }

    // Insider activity
    if (insider?.data && insider.data.length > 0) {
      const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentTrades = insider.data.filter(t => new Date(t.transactionDate) >= last30Days);
      
      const netShares = recentTrades.reduce((sum, t) => {
        return sum + (t.transactionCode === 'P' ? t.share : -t.share);
      }, 0);
      
      if (netShares > 0) {
        signals.push('INSIDER_BUYING');
      }
    }

    // Strong day move
    if (Math.abs(changePercent) >= 3) {
      signals.push('STRONG_DAY_MOVE');
    }

    return {
      symbol,
      price,
      changePercent,
      analystTarget,
      signals,
      earningsDate: earnings?.earningsCalendar?.[0]?.date || null,
      insiderActivity: insider?.data?.length || 0,
    };
  } catch (error) {
    console.error(`[MARKET] Failed to fetch ${symbol}:`, error.message);
    return null;
  }
}
