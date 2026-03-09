/**
 * FRED API — St. Louis Federal Reserve macro indicators
 */

const FRED_API_KEY = process.env.FRED_API_KEY;
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

const MACRO_SERIES = [
  { id: 'CPIAUCSL', name: 'CPI Inflation', impact: 'VERY_HIGH', source: 'fred' },
  { id: 'UNRATE', name: 'Unemployment Rate', impact: 'VERY_HIGH', source: 'fred' },
  { id: 'FEDFUNDS', name: 'Fed Funds Rate', impact: 'VERY_HIGH', source: 'fred' },
  { id: 'GDP', name: 'GDP Growth', impact: 'HIGH', source: 'fred' },
  { id: 'T10Y2Y', name: 'Yield Curve 10Y-2Y', impact: 'HIGH', source: 'finnhub' },
  { id: 'DCOILWTICO', name: 'Crude Oil WTI', impact: 'MEDIUM', source: 'finnhub' },
  { id: 'DEXUSEU', name: 'USD/EUR Rate', impact: 'MEDIUM', source: 'finnhub' },
];

/**
 * Fetch macro indicators from FRED
 * @returns {Promise<object>} { indicators, upcomingReleases }
 */
import { fetchYahooPrice } from './yahoo.mjs';

export default async function fetchMacro() {
  const indicators = [];
  const upcomingReleases = [];

  await Promise.all(
    MACRO_SERIES.map(async (series) => {
      if (series.source === 'fred') {
        if (!FRED_API_KEY) return;
        const result = await fetchSeries(series);
        // Only show if updated within 1 day
        if (result && result.indicator && result.indicator.date) {
          const indicatorDate = new Date(result.indicator.date);
          const now = new Date();
          const diffDays = Math.abs((now - indicatorDate) / (1000 * 60 * 60 * 24));
          if (diffDays <= 1) indicators.push(result.indicator);
        }
        if (result && result.release) upcomingReleases.push(result.release);
      } else if (series.source === 'finnhub') {
        let value = null, date = null;
        if (series.id === 'DCOILWTICO') {
          // Crude Oil WTI: Yahoo primary, Finnhub fallback
          const yahoo = await fetchYahooPrice('CL=F');
          if (yahoo && yahoo.price !== null) {
            value = yahoo.price;
            date = yahoo.date;
          } else {
            try {
              value = await fetchFinnhubQuote('OIL');
              date = new Date().toISOString();
            } catch (e) {
              value = null;
              date = null;
            }
          }
        } else if (series.id === 'DEXUSEU') {
          // USD/EUR Rate: Finnhub primary, Yahoo fallback
          try {
            value = await fetchFinnhubQuote('EURUSD');
            date = new Date().toISOString();
          } catch (e) {
            const yahoo = await fetchYahooPrice('EURUSD=X');
            if (yahoo && yahoo.price !== null) {
              value = yahoo.price;
              date = yahoo.date;
            }
          }
        } else if (series.id === 'T10Y2Y') {
          // Yield Curve 10Y-2Y: Finnhub primary, Yahoo fallback
          try {
            value = await fetchFinnhubYieldCurve();
            date = new Date().toISOString();
          } catch (e) {
            const yahoo = await fetchYahooPrice('US10Y=X');
            if (yahoo && yahoo.price !== null) {
              value = yahoo.price;
              date = yahoo.date;
            }
          }
        }
        if (value !== null) {
          indicators.push({
            name: series.name,
            seriesId: series.id,
            value,
            date,
            signals: [],
          });
        }
      }
    })
  );
  return { indicators, upcomingReleases };
}

async function fetchFinnhubQuote(symbol) {
  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  if (!FINNHUB_API_KEY) throw new Error('FINNHUB_API_KEY missing');
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}`;
  const response = await fetch(url, { headers: { 'X-Finnhub-Token': FINNHUB_API_KEY } });
  if (!response.ok) throw new Error('Finnhub quote failed');
  const data = await response.json();
  return data.c || null;
}

async function fetchFinnhubYieldCurve() {
  // Example: fetch US 10Y and 2Y yields, then calculate spread
  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  if (!FINNHUB_API_KEY) throw new Error('FINNHUB_API_KEY missing');
  const url10Y = `https://finnhub.io/api/v1/quote?symbol=US10Y`; // US 10Y
  const url2Y = `https://finnhub.io/api/v1/quote?symbol=US2Y`; // US 2Y
  const [resp10Y, resp2Y] = await Promise.all([
    fetch(url10Y, { headers: { 'X-Finnhub-Token': FINNHUB_API_KEY } }),
    fetch(url2Y, { headers: { 'X-Finnhub-Token': FINNHUB_API_KEY } })
  ]);
  if (!resp10Y.ok || !resp2Y.ok) throw new Error('Finnhub yield fetch failed');
  const data10Y = await resp10Y.json();
  const data2Y = await resp2Y.json();
  if (!data10Y.c || !data2Y.c) throw new Error('Yield data missing');
  return parseFloat((data10Y.c - data2Y.c).toFixed(2));
}

/**
 * Fetch a single FRED series
 */
async function fetchSeries(series) {
  try {
    // Fetch latest observation
    const obsUrl = `${FRED_BASE_URL}/series/observations?series_id=${series.id}&api_key=${FRED_API_KEY}&file_type=json&limit=10&sort_order=desc`;
    
    const response = await fetch(obsUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const observations = data.observations || [];
    
    if (observations.length === 0) {
      return null;
    }

    // Get latest value
    const latest = observations[0];
    const previous = observations[1];
    
    if (!latest || latest.value === '.') {
      return null;
    }

    const value = parseFloat(latest.value);
    const prevValue = previous && previous.value !== '.' ? parseFloat(previous.value) : null;
    
    // Detect signals
    const signals = [];
    
    if (series.id === 'T10Y2Y' && value < 0) {
      signals.push('YIELD_CURVE_INVERTED');
    }
    
    if (series.id === 'CPIAUCSL' && value > 3) {
      signals.push('INFLATION_ELEVATED');
    }
    
    if (prevValue && Math.abs((value - prevValue) / prevValue) > 0.1) {
      signals.push('TREND_REVERSAL');
    }

    const indicator = {
      name: series.name,
      seriesId: series.id,
      value,
      previousValue: prevValue,
      date: latest.date,
      impact: series.impact,
      signals,
    };

    // Check for upcoming release (placeholder - would need separate API call)
    const release = checkUpcomingRelease(series, latest.date);

    return { indicator, release };
  } catch (error) {
    console.error(`[MACRO] Series ${series.id} failed:`, error.message);
    return null;
  }
}

/**
 * Check if release is approaching (simplified - assumes monthly releases)
 */
function checkUpcomingRelease(series, lastDate) {
  const last = new Date(lastDate);
  const now = new Date();
  const daysSinceLast = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  
  // If last data is more than 25 days old, release is likely approaching
  if (daysSinceLast > 25 && daysSinceLast < 35) {
    return {
      name: series.name,
      seriesId: series.id,
      estimatedDate: 'Within 7 days',
      impact: series.impact,
      signal: 'RELEASE_APPROACHING',
    };
  }
  
  return null;
}
