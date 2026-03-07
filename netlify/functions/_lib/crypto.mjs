/**
 * CoinGecko API — Crypto signals
 * Free API, no key required, 30 calls/min
 */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const DELAY_MS = 200; // Rate limit: 30 calls/min = 2000ms, use 200ms for safety

/**
 * Fetch crypto signals
 * @returns {Promise<Array>} Crypto signal items
 */
export default async function fetchCryptoSignals() {
  const watchedCryptos = (process.env.WATCHED_CRYPTOS || 'bitcoin,ethereum,solana')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);

  if (watchedCryptos.length === 0) {
    return [];
  }

  try {
    const results = await Promise.allSettled(
      watchedCryptos.map((coinId, idx) => 
        new Promise(resolve => 
          setTimeout(() => resolve(fetchCoinData(coinId)), idx * DELAY_MS)
        )
      )
    );

    const cryptoSignals = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        cryptoSignals.push(result.value);
      }
    });

    return cryptoSignals;
  } catch (error) {
    console.error('[CRYPTO] Fetch failed:', error.message);
    return [];
  }
}

/**
 * Fetch data for a single coin
 */
async function fetchCoinData(coinId) {
  try {
    // Fetch current data and market chart
    const [currentData, chartData] = await Promise.all([
      fetch(`${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`)
        .then(r => r.ok ? r.json() : null),
      fetch(`${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=7`)
        .then(r => r.ok ? r.json() : null),
    ]);

    if (!currentData) {
      throw new Error('Failed to fetch coin data');
    }

    const marketData = currentData.market_data;
    const price = marketData.current_price?.usd || 0;
    const change24h = marketData.price_change_percentage_24h || 0;
    const volume24h = marketData.total_volume?.usd || 0;
    const marketCap = marketData.market_cap?.usd || 0;

    // Calculate 7-day average volume
    let avgVolume7d = volume24h;
    if (chartData?.total_volumes) {
      const volumes = chartData.total_volumes.map(v => v[1]);
      avgVolume7d = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    }

    // Detect signals
    const signals = [];
    
    if (volume24h >= avgVolume7d * 3) {
      signals.push('VOLUME_SPIKE_3X');
    } else if (volume24h >= avgVolume7d * 2) {
      signals.push('VOLUME_SPIKE_2X');
    }
    
    if (Math.abs(change24h) >= 10) {
      signals.push('STRONG_MOVE_10PCT');
    } else if (Math.abs(change24h) >= 8) {
      signals.push('STRONG_MOVE');
    }

    // Check for trend (3 consecutive closes)
    if (chartData?.prices && chartData.prices.length >= 3) {
      const last3 = chartData.prices.slice(-3).map(p => p[1]);
      if (last3[0] < last3[1] && last3[1] < last3[2]) {
        signals.push('UPTREND');
      } else if (last3[0] > last3[1] && last3[1] > last3[2]) {
        signals.push('DOWNTREND');
      }
    }

    return {
      id: coinId,
      name: currentData.name,
      symbol: currentData.symbol?.toUpperCase(),
      price,
      change24h,
      volume24h,
      marketCap,
      signals,
      priceHistory: chartData?.prices || [],
    };
  } catch (error) {
    console.error(`[CRYPTO] Failed to fetch ${coinId}:`, error.message);
    return null;
  }
}
