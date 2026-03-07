/**
 * SEC EDGAR — Securities filings
 * 8-K (material events), S-1 (IPO), 13F (institutional holdings), Form 4 (insider trades)
 */

const EDGAR_USER_AGENT = process.env.EDGAR_USER_AGENT || 'IntelligenceBot/1.0 admin@example.com';
const EDGAR_BASE = 'https://www.sec.gov';
const DELAY_MS = 150; // Rate limit: 10 req/sec = 100ms, use 150ms to be safe

/**
 * Fetch recent SEC filings
 * @returns {Promise<Array>} Filing items
 */
export default async function fetchEdgarFilings() {
  const filingTypes = ['8-K', 'S-1', '13F-HR', '4'];
  
  try {
    const results = await Promise.allSettled(
      filingTypes.map((type, idx) => 
        new Promise(resolve => 
          setTimeout(() => resolve(fetchFilingType(type)), idx * DELAY_MS)
        )
      )
    );

    const filings = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        filings.push(...result.value);
      }
    });

    return filings;
  } catch (error) {
    console.error('[EDGAR] Fetch failed:', error.message);
    return [];
  }
}

/**
 * Fetch filings of a specific type
 */
async function fetchFilingType(filingType) {
  try {
    // Use RSS feed for recent filings
    const url = `${EDGAR_BASE}/cgi-bin/browse-edgar?action=getcurrent&type=${filingType}&count=20&output=atom`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': EDGAR_USER_AGENT,
        'Accept': 'application/atom+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`EDGAR API error: ${response.status}`);
    }

    const xml = await response.text();
    
    // Simple XML parsing for Atom feed
    const entries = parseAtomFeed(xml);
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;

    return entries
      .filter(entry => {
        const timestamp = new Date(entry.updated).getTime();
        return timestamp >= yesterday;
      })
      .map(entry => ({
        companyName: entry.title.split(' - ')[0] || 'Unknown',
        filingType,
        description: getFilingDescription(filingType),
        filingDate: entry.updated,
        url: entry.link,
        isWatchlistHit: false,
        source: 'SEC EDGAR',
      }));
  } catch (error) {
    console.error(`[EDGAR] Filing type ${filingType} failed:`, error.message);
    return [];
  }
}

/**
 * Simple Atom feed parser
 */
function parseAtomFeed(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    
    const titleMatch = /<title>(.*?)<\/title>/.exec(entryXml);
    const linkMatch = /<link.*?href="(.*?)"/.exec(entryXml);
    const updatedMatch = /<updated>(.*?)<\/updated>/.exec(entryXml);
    
    if (titleMatch && linkMatch && updatedMatch) {
      entries.push({
        title: titleMatch[1],
        link: linkMatch[1],
        updated: updatedMatch[1],
      });
    }
  }
  
  return entries;
}

/**
 * Get human-readable description of filing type
 */
function getFilingDescription(filingType) {
  const descriptions = {
    '8-K': 'Material corporate event',
    'S-1': 'IPO registration',
    '13F-HR': 'Institutional holdings report',
    '4': 'Insider trade',
  };
  
  return descriptions[filingType] || filingType;
}
