// Yahoo Finance API (unofficial) — fallback for FX and commodities
// Usage: fetchYahooPrice(symbol)

import fetch from 'node-fetch';

/**
 * Fetch latest price for a Yahoo Finance symbol
 * @param {string} symbol - e.g. 'EURUSD=X', 'CL=F'
 * @returns {Promise<{price: number, date: string}>}
 */
export async function fetchYahooPrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const result = data.chart.result[0];
    const price = result.meta.regularMarketPrice;
    const date = new Date(result.meta.regularMarketTime * 1000).toISOString();
    return { price, date };
  } catch (e) {
    console.error(`[YAHOO] Fetch failed for ${symbol}:`, e.message);
    return null;
  }
}
