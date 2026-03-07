/**
 * Watchlist — Cross-source company/ticker/region filter
 * Tags all items that mention watched entities
 */

/**
 * Apply watchlist filtering to all collected data
 * @param {object} allData - All data from sources
 * @returns {object} { watchlistHits, updatedData }
 */
export default function applyWatchlist(allData) {
  // Parse watchlists from env
  const watchedCompanies = (process.env.WATCHED_COMPANIES || '')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);

  const watchedStocks = (process.env.WATCHED_STOCKS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const watchedCryptos = (process.env.WATCHED_CRYPTOS || '')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);

  // BSE-listed companies for Bulgaria
  const bseCompanies = [
    'sopharma',
    'first investment bank',
    'eurohold',
    'bulgarian energy holding',
  ];

  const allWatchedTerms = [
    ...watchedCompanies,
    ...watchedStocks,
    ...watchedCryptos,
    ...bseCompanies,
  ];

  if (allWatchedTerms.length === 0) {
    return { watchlistHits: [], updatedData: allData };
  }

  const watchlistHits = [];

  // Helper function to check if text contains watched terms
  const containsWatchedTerm = (text) => {
    if (!text) return null;
    const lowerText = text.toLowerCase();
    return allWatchedTerms.find(term => lowerText.includes(term));
  };

  // Process all data sources
  const updatedData = { ...allData };

  // Early bird items
  if (allData.earlyBirdItems) {
    updatedData.earlyBirdItems = allData.earlyBirdItems.map(item => {
      const matchedTerm = containsWatchedTerm(`${item.title} ${item.description}`);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: item.signals?.join(', ') || 'Mention',
          source: item.source,
          signalTier: item.tier,
          url: item.url,
          pubDate: item.pubDate,
        });
      }
      return item;
    });
  }

  // Central bank items
  if (allData.centralBankItems) {
    updatedData.centralBankItems = allData.centralBankItems.map(item => {
      const matchedTerm = containsWatchedTerm(`${item.title} ${item.description}`);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: item.signals?.join(', ') || 'Mention',
          source: item.source,
          signalTier: item.tier,
          url: item.url,
          pubDate: item.pubDate,
        });
      }
      return item;
    });
  }

  // Regional items
  if (allData.regionalItems) {
    updatedData.regionalItems = allData.regionalItems.map(item => {
      const matchedTerm = containsWatchedTerm(`${item.title} ${item.description}`);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: item.signals?.join(', ') || 'Mention',
          source: item.source,
          region: item.region,
          signalTier: item.tier,
          url: item.url,
          pubDate: item.pubDate,
        });
      }
      return item;
    });
  }

  // News items
  ['globalNews', 'techNews', 'economyNews', 'regionalNews'].forEach(key => {
    if (allData[key]) {
      updatedData[key] = allData[key].map(item => {
        const matchedTerm = containsWatchedTerm(`${item.title} ${item.description}`);
        if (matchedTerm) {
          item.isWatchlistHit = true;
          watchlistHits.push({
            company: matchedTerm,
            signal: 'News mention',
            source: item.source,
            region: item.region,
            url: item.url,
            pubDate: item.pubDate,
          });
        }
        return item;
      });
    }
  });

  // Contracts
  if (allData.contracts) {
    updatedData.contracts = allData.contracts.map(item => {
      const matchedTerm = containsWatchedTerm(item.title);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: `Contract (${item.signalTier})`,
          source: item.source,
          url: item.url,
          pubDate: item.postedDate,
        });
      }
      return item;
    });
  }

  // EDGAR filings
  if (allData.edgarFilings) {
    updatedData.edgarFilings = allData.edgarFilings.map(item => {
      const matchedTerm = containsWatchedTerm(item.companyName);
      if (matchedTerm) {
        item.isWatchlistHit = true;
        watchlistHits.push({
          company: matchedTerm,
          signal: `SEC ${item.filingType}`,
          source: item.source,
          url: item.url,
          pubDate: item.filingDate,
        });
      }
      return item;
    });
  }

  // Deduplicate watchlist hits by URL
  const uniqueHits = [];
  const seenUrls = new Set();
  
  watchlistHits.forEach(hit => {
    if (!seenUrls.has(hit.url)) {
      seenUrls.add(hit.url);
      uniqueHits.push(hit);
    }
  });

  return {
    watchlistHits: uniqueHits,
    updatedData,
  };
}
