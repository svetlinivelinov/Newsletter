/**
 * FRED API — St. Louis Federal Reserve macro indicators
 */

const FRED_API_KEY = process.env.FRED_API_KEY;
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

const MACRO_SERIES = [
  { id: 'CPIAUCSL', name: 'CPI Inflation', impact: 'VERY_HIGH' },
  { id: 'UNRATE', name: 'Unemployment Rate', impact: 'VERY_HIGH' },
  { id: 'FEDFUNDS', name: 'Fed Funds Rate', impact: 'VERY_HIGH' },
  { id: 'GDP', name: 'GDP Growth', impact: 'HIGH' },
  { id: 'T10Y2Y', name: 'Yield Curve 10Y-2Y', impact: 'HIGH' },
  { id: 'DCOILWTICO', name: 'Crude Oil WTI', impact: 'MEDIUM' },
  { id: 'DEXUSEU', name: 'USD/EUR Rate', impact: 'MEDIUM' },
];

/**
 * Fetch macro indicators from FRED
 * @returns {Promise<object>} { indicators, upcomingReleases }
 */
export default async function fetchMacro() {
  if (!FRED_API_KEY) {
    console.warn('[MACRO] FRED_API_KEY not set, skipping macro data');
    return { indicators: [], upcomingReleases: [] };
  }

  try {
    const results = await Promise.allSettled(
      MACRO_SERIES.map(series => fetchSeries(series))
    );

    const indicators = [];
    const upcomingReleases = [];

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const { indicator, release } = result.value;
        if (indicator) indicators.push(indicator);
        if (release) upcomingReleases.push(release);
      }
    });

    return { indicators, upcomingReleases };
  } catch (error) {
    console.error('[MACRO] FRED fetch failed:', error.message);
    return { indicators: [], upcomingReleases: [] };
  }
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
