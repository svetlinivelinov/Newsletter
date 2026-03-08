import { createHash } from 'crypto';

const GDELT_LAST_UPDATE_URL = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';

// High-priority CAMEO event code prefixes
const HIGH_PRIORITY_PREFIXES = ['14', '17', '18', '19', '20'];
const HIGH_PRIORITY_CODES = ['0211', '0231', '0311', '1011', '1031'];

/**
 * Fetch and parse the GDELT 15-minute event feed
 * @returns {Promise<Array>} Normalized event objects
 */
export async function fetchGDELT() {
  try {
    console.info('[GDELT] Fetching latest update URL...');

    // Step 1: Get the latest export URL from lastupdate.txt
    const updateResp = await fetch(GDELT_LAST_UPDATE_URL, {
      headers: { 'User-Agent': 'IntelligenceNewsletter/1.0' },
    });
    if (!updateResp.ok) throw new Error(`lastupdate.txt HTTP ${updateResp.status}`);

    const updateText = await updateResp.text();
    const lines = updateText.trim().split('\n');

    // The export CSV URL is on the first line (the main events export)
    // Format: "size hash url"
    const exportLine = lines.find(l => l.includes('.export.CSV'));
    if (!exportLine) throw new Error('No export CSV found in lastupdate.txt');

    const csvUrl = exportLine.trim().split(/\s+/).pop();
    console.info('[GDELT] Export URL:', csvUrl);

    // Step 2: Fetch the zipped CSV
    const csvResp = await fetch(csvUrl, {
      headers: { 'User-Agent': 'IntelligenceNewsletter/1.0' },
    });
    if (!csvResp.ok) throw new Error(`CSV download HTTP ${csvResp.status}`);

    const zipBuffer = await csvResp.arrayBuffer();

    // Step 3: Decompress the zip — GDELT uses zip format
    // Use the built-in DecompressionStream for .zip isn't straightforward,
    // so we parse the zip manually (single-entry zip with DEFLATE or STORE)
    const tsvText = await extractFirstFileFromZip(new Uint8Array(zipBuffer));
    if (!tsvText) throw new Error('Failed to extract TSV from zip');

    // Step 4: Parse TSV rows
    const rows = tsvText.trim().split('\n');
    console.info(`[GDELT] Parsing ${rows.length} rows...`);

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

    console.info(`[GDELT] Parsed ${events.length} valid events`);
    return events;
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
    const { Readable } = await import('stream');
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
