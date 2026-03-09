const GDELT_BASE_URL = 'http://data.gdeltproject.org/gdeltv2/';
const HOURS_TO_FETCH = 24; // Fetch last 24 hours of data
const INTERVALS_PER_HOUR = 4; // GDELT updates every 15 minutes
const BATCH_SIZE = 10; // Fetch 10 files at a time to avoid timeouts
const BATCH_DELAY_MS = 500; // Wait between batches to be respectful
const FETCH_TIMEOUT_MS = 15000; // 15s per file — bail early if GDELT is slow

/**
 * Build GDELT archive URL for a specific timestamp
 * Format: http://data.gdeltproject.org/gdeltv2/YYYYMMDDHHMMSS.export.CSV.zip
 * @param {Date} date - Timestamp (will be rounded to nearest 15-min interval)
 * @returns {string} Archive URL
 */
function buildGDELTArchiveURL(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = '00'; // Always 00 for GDELT exports
  
  return `${GDELT_BASE_URL}${year}${month}${day}${hour}${minute}${second}.export.CSV.zip`;
}

/**
 * Round timestamp to nearest 15-minute interval
 * GDELT publishes at :00, :15, :30, :45
 */
function roundTo15Minutes(date) {
  const minutes = date.getUTCMinutes();
  const rounded = Math.floor(minutes / 15) * 15;
  const result = new Date(date);
  result.setUTCMinutes(rounded, 0, 0);
  return result;
}

/**
 * Fetch and parse a single GDELT export file
 * @param {string} url - GDELT archive URL
 * @returns {Promise<Array>} Parsed events from this file
 */
async function fetchSingleGDELTExport(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const csvResp = await fetch(url, {
      headers: { 'User-Agent': 'IntelligenceNewsletter/1.0' },
      signal: controller.signal,
    });
    
    if (!csvResp.ok) {
      // 404 is common for recent intervals that haven't been published yet
      if (csvResp.status === 404) return [];
      throw new Error(`HTTP ${csvResp.status}`);
    }

    const zipBuffer = await csvResp.arrayBuffer();
    const tsvText = await extractFirstFileFromZip(new Uint8Array(zipBuffer));
    if (!tsvText) return [];

    return parseTSVRows(tsvText);
  } catch (error) {
    // Non-fatal: just log and return empty
    console.warn(`[GDELT] Failed to fetch ${url}:`, error.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse TSV rows into event objects
 * @param {string} tsvText - Tab-separated values text
 * @returns {Array} Array of event objects
 */
function parseTSVRows(tsvText) {
  const rows = tsvText.trim().split('\n');
  const events = [];

  for (const row of rows) {
    const cols = row.split('\t');
    if (cols.length < 61) continue;

    const eventId = cols[0];
    const sqlDate = cols[1];
    const eventCode = cols[26] || '';
    const numMentions = parseInt(cols[31], 10) || 0;
    const avgTone = parseFloat(cols[34]) || 0;
    const sourceUrl = cols[60] || '';

    // Skip rows without a valid URL
    if (!sourceUrl || !sourceUrl.startsWith('http')) continue;

    // Parse YYYYMMDD to Date
    const year = sqlDate.substring(0, 4);
    const month = sqlDate.substring(4, 6);
    const day = sqlDate.substring(6, 8);
    const timestamp = new Date(`${year}-${month}-${day}T00:00:00Z`);

    events.push({
      id: `gdelt_${eventId}`,
      source: 'gdelt',
      title: `GDELT Event ${eventCode} — ${eventId}`,
      summary: `EventCode: ${eventCode}, Mentions: ${numMentions}, Tone: ${avgTone.toFixed(1)}`,
      url: sourceUrl,
      timestamp,
      tone: avgTone,
      category: eventCode,
      numMentions,
      score: 0,
      confirmed: false,
    });
  }

  return events;
}

/**
 * Fetch and parse the last 24 hours of GDELT event data
 * @returns {Promise<Array>} Normalized event objects from last 24 hours
 */
export async function fetchGDELT() {
  try {
    console.info(`[GDELT] Fetching last ${HOURS_TO_FETCH} hours of data...`);
    
    // Build list of timestamps for last 24 hours (96 intervals)
    const now = new Date();
    const startTime = roundTo15Minutes(now);
    const totalIntervals = HOURS_TO_FETCH * INTERVALS_PER_HOUR;
    
    const urls = [];
    for (let i = 0; i < totalIntervals; i++) {
      const timestamp = new Date(startTime.getTime() - (i * 15 * 60 * 1000));
      urls.push(buildGDELTArchiveURL(timestamp));
    }
    
    console.info(`[GDELT] Fetching ${urls.length} files in batches of ${BATCH_SIZE}...`);
    
    // Fetch in batches to avoid overwhelming the server and timing out
    const allEvents = [];
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(urls.length / BATCH_SIZE);
      
      console.info(`[GDELT] Processing batch ${batchNum}/${totalBatches}...`);
      
      const results = await Promise.all(batch.map(url => fetchSingleGDELTExport(url)));
      
      for (const events of results) {
        if (events.length > 0) {
          allEvents.push(...events);
          successCount++;
        } else {
          failCount++;
        }
      }
      
      // Wait between batches (except for the last one)
      if (i + BATCH_SIZE < urls.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
    
    console.info(`[GDELT] Fetched ${successCount} files successfully, ${failCount} failed/empty`);
    console.info(`[GDELT] Total events collected: ${allEvents.length}`);
    
    // Deduplicate by event ID (in case of overlaps)
    const uniqueEvents = [];
    const seenIds = new Set();
    
    for (const event of allEvents) {
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id);
        uniqueEvents.push(event);
      }
    }
    
    console.info(`[GDELT] After deduplication: ${uniqueEvents.length} unique events`);
    return uniqueEvents;
    
  } catch (error) {
    console.error('[GDELT] Fetch failed:', error.message);
    return [];
  }
}

/**
 * Extract the first file from a ZIP archive (supports STORE and DEFLATE)
 * Using only built-in Node.js APIs (no npm dependencies)
 */
async function extractFirstFileFromZip(zipBytes) {
  try {
    const { createInflateRaw } = await import('zlib');
    const { Buffer } = await import('buffer');

    // Local file header signature = 0x04034b50
    if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b ||
        zipBytes[2] !== 0x03 || zipBytes[3] !== 0x04) {
      throw new Error('Not a valid ZIP file');
    }

    const compressionMethod = zipBytes[8] | (zipBytes[9] << 8);
    const compressedSize = zipBytes[18] | (zipBytes[19] << 8) | (zipBytes[20] << 16) | (zipBytes[21] << 24);
    const fileNameLen = zipBytes[26] | (zipBytes[27] << 8);
    const extraLen = zipBytes[28] | (zipBytes[29] << 8);
    const dataOffset = 30 + fileNameLen + extraLen;

    const compressedData = zipBytes.slice(dataOffset, dataOffset + compressedSize);

    if (compressionMethod === 0) {
      // STORE — no compression
      return Buffer.from(compressedData).toString('utf-8');
    } else if (compressionMethod === 8) {
      // DEFLATE
      return new Promise((resolve, reject) => {
        const inflate = createInflateRaw();
        const chunks = [];
        inflate.on('data', chunk => chunks.push(chunk));
        inflate.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        inflate.on('error', reject);
        inflate.end(Buffer.from(compressedData));
      });
    } else {
      throw new Error(`Unsupported compression method: ${compressionMethod}`);
    }
  } catch (error) {
    console.error('[GDELT] ZIP extraction failed:', error.message);
    return null;
  }
}

export default fetchGDELT;
