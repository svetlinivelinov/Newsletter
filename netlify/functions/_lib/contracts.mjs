/**
 * SAM.gov + USASpending.gov — Government contract intelligence
 */

const SAM_GOV_API_KEY = process.env.SAM_GOV_API_KEY;
const SAM_GOV_BASE = 'https://api.sam.gov/opportunities/v2/search';
const USASPENDING_BASE = 'https://api.usaspending.gov/api/v2';

// NAICS codes for defense/tech sectors
const NAICS_CODES = ['541512', '541511', '336411', '541330'];

/**
 * Fetch contract opportunities and awards
 * @returns {Promise<Array>} Contract items with signalTier
 */
export default async function fetchContracts() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  try {
    const [samResults, usaResults] = await Promise.allSettled([
      fetchSAMOpportunities(yesterday),
      fetchUSASpendingAwards(yesterday),
    ]);

    const contracts = [];
    
    if (samResults.status === 'fulfilled' && samResults.value) {
      contracts.push(...samResults.value);
    }
    
    if (usaResults.status === 'fulfilled' && usaResults.value) {
      contracts.push(...usaResults.value);
    }

    return contracts;
  } catch (error) {
    console.error('[CONTRACTS] Fetch failed:', error.message);
    return [];
  }
}

/**
 * Fetch SAM.gov opportunities
 */
async function fetchSAMOpportunities(sinceDate) {
  if (!SAM_GOV_API_KEY) {
    console.warn('[CONTRACTS] SAM_GOV_API_KEY not set, skipping SAM.gov');
    return [];
  }

  try {
    const url = new URL(SAM_GOV_BASE);
    url.searchParams.set('api_key', SAM_GOV_API_KEY);
    url.searchParams.set('postedFrom', sinceDate);
    url.searchParams.set('limit', '50');

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SAM.gov API error: ${response.status}`);
    }

    const data = await response.json();
    const opportunities = data.opportunitiesData || [];

    return opportunities
      .filter(opp => {
        // Filter for relevant NAICS codes
        const naicsCode = opp.naicsCode?.toString();
        return naicsCode && NAICS_CODES.some(code => naicsCode.startsWith(code));
      })
      .map(opp => {
        // Determine signal tier
        let signalTier = 'early';
        if (opp.type?.toLowerCase().includes('presolicitation')) {
          signalTier = 'early';
        } else if (opp.active) {
          signalTier = 'active';
        }

        return {
          title: opp.title,
          department: opp.department || opp.agencyName || 'Unknown',
          amount: opp.estimatedValue || 'Not disclosed',
          signalTier,
          postedDate: opp.postedDate,
          responseDeadline: opp.responseDeadLine,
          url: `https://sam.gov/opp/${opp.noticeId}`,
          isWatchlistHit: false,
          source: 'SAM.gov',
        };
      });
  } catch (error) {
    console.error('[CONTRACTS] SAM.gov fetch failed:', error.message);
    return [];
  }
}

/**
 * Fetch USASpending.gov awards
 */
async function fetchUSASpendingAwards(sinceDate) {
  try {
    const url = `${USASPENDING_BASE}/search/spending_by_award/`;
    
    const requestBody = {
      filters: {
        time_period: [
          {
            start_date: sinceDate,
            end_date: new Date().toISOString().split('T')[0],
          },
        ],
        award_type_codes: ['A', 'B', 'C', 'D'], // Contracts
      },
      fields: [
        'Award ID',
        'Recipient Name',
        'Award Amount',
        'Description',
        'Award Date',
        'Awarding Agency',
      ],
      limit: 50,
      sort: 'Award Amount',
      order: 'desc',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`USASpending API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    return results
      .filter(award => {
        const amount = award['Award Amount'] || 0;
        return amount >= 10000000; // $10M minimum
      })
      .map(award => ({
        title: award.Description || 'Contract Award',
        department: award['Awarding Agency'] || 'Unknown',
        amount: `$${(award['Award Amount'] / 1000000).toFixed(1)}M`,
        signalTier: 'awarded',
        postedDate: award['Award Date'],
        responseDeadline: null,
        url: `https://www.usaspending.gov/award/${award['Award ID']}`,
        isWatchlistHit: false,
        source: 'USASpending.gov',
      }));
  } catch (error) {
    console.error('[CONTRACTS] USASpending fetch failed:', error.message);
    return [];
  }
}
