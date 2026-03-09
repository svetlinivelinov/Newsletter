# Daily Digest Workflow (05:30 UTC)

This document describes the complete workflow that executes when the daily newsletter is triggered at **05:30 UTC**.

## Trigger Mechanisms

The daily digest can be triggered in three ways:

### 1. Primary: Netlify Scheduled Function
- **Schedule**: `30 5 * * *` (05:30 UTC daily)
- **Configuration**: Defined in `netlify.toml`
- **Function**: `send-newsletters-background.mjs`
- **Timeout**: 15 minutes (Netlify background function limit)
- **Authentication**: Netlify's internal scheduler (validated via `next_run` field in request body)

### 2. Backup: GitHub Actions
- **Schedule**: `30 5 * * *` (05:30 UTC daily)
- **Configuration**: `.github/workflows/daily-newsletter.yml`
- **Action**: Makes POST request to Netlify function with `x-cron-secret` header
- **Purpose**: Ensures delivery even if Netlify scheduler fails
- **Authentication**: `CRON_SECRET` environment variable

### 3. Manual Trigger
- **Script**: `trigger-newsletter.ps1`
- **Command**: `./trigger-newsletter.ps1`
- **Authentication**: Uses `CRON_SECRET` from local `.env` file
- **Purpose**: Testing and emergency sends

## Workflow Steps

### Step 1: Authentication (0-1 second)
```
┌─────────────────────────────┐
│  Request Received at 05:30  │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Check Authentication       │
│  - Netlify scheduler? OR    │
│  - Valid x-cron-secret?     │
└──────────┬──────────────────┘
           │
    ┌──────┴──────┐
    │             │
   YES           NO
    │             │
    │         [401 Unauthorized]
    │
    ▼
```

### Step 2: Data Collection (30-90 seconds)

All data sources are fetched **in parallel** using `Promise.allSettled()`:

| Source | Function | Typical Data | Time |
|--------|----------|--------------|------|
| **Global News** | `fetchNews()` | Bing Search API headlines | 10-20s |
| **RSS Feeds** | `fetchRSS()` | Early Bird Brief, central bank feeds | 5-15s |
| **Regional News** | `fetchRegionalFeeds()` | MENA/Africa/Asia feeds | 10-25s |
| **Macro Indicators** | `fetchMacro()` | Economic data releases | 5-10s |
| **Gov Contracts** | `fetchContracts()` | sam.gov procurement data | 10-20s |
| **SEC Filings** | `fetchEdgarFilings()` | 8-K, 10-K, 10-Q filings | 15-30s |
| **Crypto Signals** | `fetchCryptoSignals()` | Price movements, whale activity | 5-10s |
| **Market Signals** | `fetchMarketSignals()` | Stock movers, sector trends | 5-10s |

**Error Handling**: If any source fails, it returns empty data (non-fatal). The newsletter will still send with available data.

**Logging Output**:
```javascript
[DIGEST] Data collection complete: {
  news: 45,
  rss: 23,
  regional: 18,
  macro: 12,
  contracts: 8,
  edgar: 15,
  crypto: 6,
  market: 9
}
```

### Step 3: Watchlist Filtering (1-3 seconds)

```
┌─────────────────────────────┐
│  Combined Data              │
│  - Global/Tech/Economy News │
│  - RSS Items                │
│  - Regional Feeds           │
│  - Macro Indicators         │
│  - Contracts & Filings      │
│  - Crypto & Market Signals  │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Apply Watchlist Filters    │
│  - Check titles/descriptions│
│  - Tag matching items       │
│  - Build watchlistHits[]    │
└──────────┬──────────────────┘
           │
           ▼
[DIGEST] Watchlist hits: 7
```

### Step 4: Intelligence Signals (60-120 seconds)

Fetches Phase 4 multi-source intelligence signals:

```javascript
signals = await buildSignalList();
// Gets data from:
// - GDELT last 24 hours (gdelt.mjs) — ~96 files, 15-min intervals
// - Press releases (press.mjs) — official announcements
// - Reddit discussions (reddit.mjs) — social sentiment
// - Google News (news.mjs) — trending stories
// - Cross-source correlation for confirmation

[GDELT] Fetching last 24 hours of data...
[GDELT] Fetching 96 files in batches of 10...
[GDELT] Processing batch 1/10...
[GDELT] Processing batch 2/10...
...
[GDELT] Fetched 92 files successfully, 4 failed/empty
[GDELT] Total events collected: 18,234
[GDELT] After deduplication: 18,127 unique events
[SIGNALS] Got 95 signals (23 confirmed)
```

**Signal Types**:
- 🟢 **Confirmed**: 3+ sources agree
- 🟡 **Emerging**: 2 sources detected
- ⚪ **Unconfirmed**: Single source

**GDELT Fetch Details**:
- **Coverage**: Last 24 hours (96 × 15-minute intervals)
- **Batch Size**: 10 files per batch (to avoid timeouts)
- **Batch Delay**: 500ms between batches
- **Deduplication**: Events are deduplicated by ID
- **Typical Volume**: 15,000-20,000 events per day
- **Time**: ~60-120 seconds (depends on GDELT server response)

### Step 5: AI Content Generation (20-60 seconds)

```
┌─────────────────────────────┐
│  Generate AI Content        │
│  - OpenAI GPT-4             │
│  - Structured prompt        │
│  - HTML email template      │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  HTML Newsletter            │
│  - Executive Summary        │
│  - Top Stories              │
│  - Macro Outlook            │
│  - Watchlist Alerts         │
│  - Intelligence Signals     │
│  - Regional Highlights      │
└─────────────────────────────┘
```

**AI Model**: OpenAI GPT-4 (configured in `ai.mjs`)  
**Prompt Type**: `digest` template

### Step 6: Subscriber Loading (1-2 seconds)

```
┌─────────────────────────────┐
│  Load Subscribers           │
│  - Query Resend Audience    │
│  - Filter active only       │
└──────────┬──────────────────┘
           │
    ┌──────┴──────┐
    │             │
  Empty         Has Subscribers
    │             │
    │             ▼
    │      [DIGEST] Sending to 47 subscribers...
    │
    ▼
[200 OK - No active subscribers]
```

### Step 7: Email Delivery (1 second per subscriber)

**Rate Limiting**: Resend free tier allows 2 req/s, but we use **1 req/s** for safety.

```
FOR EACH subscriber:
  ┌─────────────────────────────┐
  │  Send Email via Resend      │
  │  - To: subscriber.email     │
  │  - From: digest@...         │
  │  - Subject: Daily Brief     │
  │  - HTML body                │
  └──────────┬──────────────────┘
             │
      ┌──────┴──────┐
      │             │
    Success       Failed
      │             │
   sent++        failed++
      │          errors.push()
      │
      ▼
  [Wait 1000ms] ─────┐
                     │
  ◄──────────────────┘
```

**For 47 subscribers**: ~47 seconds  
**For 100 subscribers**: ~100 seconds

### Step 8: Statistics & Response (1 second)

```
┌─────────────────────────────┐
│  Calculate Stats            │
│  - Total sent               │
│  - Total failed             │
│  - Execution duration       │
│  - Sample errors (first 10) │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Return 200 OK              │
│  {                          │
│    success: true,           │
│    sent: 45,                │
│    failed: 2,               │
│    duration: "182.34s",     │
│    errors: [...]            │
│  }                          │
└─────────────────────────────┘
```

**Console Output**:
```
[DIGEST] Complete in 182.34s - Sent: 45, Failed: 2
```

## Timing Breakdown (Typical)

| Phase | Time | % |
|-------|------|---|
| Authentication | 1s | <1% |
| Data Collection | 45s | 14% |
| Watchlist Filtering | 2s | <1% |
| Intelligence Signals | 90s | 28% |
| AI Generation | 40s | 12% |
| Subscriber Loading | 2s | <1% |
| Email Delivery (50 subs) | 50s | 15% |
| Response | 1s | <1% |
| **TOTAL** | **~5 minutes** | **100%** |

**For 100 subscribers**: ~6 minutes  
**For 500 subscribers**: ~10 minutes  
**Maximum (15 min timeout)**: ~700 subscribers

**Note**: Intelligence Signals phase takes longer because GDELT fetches 96 files (24 hours of data) in batches of 10.

## Error Scenarios

### Non-Fatal Errors (Newsletter Still Sends)

1. **Data Source Failure**
   - One or more sources return empty
   - Newsletter sent with remaining data
   - Logged but not blocking

2. **Intelligence Signals Failure**
   - Signal list empty or fails
   - Newsletter sent without signals section
   - Logged as non-fatal

3. **Individual Email Failure**
   - Some subscribers fail to receive
   - Logged in `errors` array
   - Other subscribers still get email

### Fatal Errors (Newsletter Aborted)

1. **Authentication Failure**
   - Returns 401 Unauthorized
   - No data is fetched

2. **No Data Available**
   - All sources return empty
   - Returns 200 OK with message: "No data to send"

3. **No Active Subscribers**
   - Subscriber list is empty
   - Returns 200 OK with message: "No active subscribers"

4. **AI Generation Failure**
   - OpenAI API error
   - Returns 500 Internal Server Error

5. **Timeout (15 minutes)**
   - Netlify kills the function
   - Incomplete execution

## Monitoring & Logs

### Netlify Function Logs
- Access: Netlify Dashboard → Functions → send-newsletters-background
- Shows: All console.info/error outputs
- Retention: 7 days (free tier)

### GitHub Actions Logs
- Access: GitHub → Actions → Daily Newsletter Trigger
- Shows: HTTP response from function
- Retention: 90 days

### Key Log Searches

**Successful Run**:
```
[DIGEST] Complete in
```

**Failed Authentication**:
```
[DIGEST] Unauthorized cron attempt
```

**No Data**:
```
[DIGEST] No data to send
```

**Email Failures**:
```
[DIGEST] Failed to send to
```

## Post-Execution

After the 05:30 UTC trigger completes:

1. **Subscribers receive email** (typically by 05:37 UTC)
2. **Function logs stored** in Netlify
3. **GitHub Action completes** with status code
4. **Email analytics begin** (open rates, click rates via Resend)

## Data Coverage Details

### Intelligence Signals (GDELT)
- **Time Range**: Last 24 hours (from ~05:30 UTC previous day to 05:30 UTC current day)
- **Update Frequency**: 15-minute intervals
- **Total Files**: 96 exports per day
- **Typical Events**: 15,000-20,000 global events per day
- **Event Types**: Focus on high-priority CAMEO codes (protests, conflicts, threats, violence)
- **Limitation**: Most recent 1-2 intervals may return 404 (not published yet)

### Other Data Sources
- **Bing News**: Last 24 hours of headlines
- **RSS Feeds**: Latest available items
- **SEC Filings**: Last 24 hours
- **Contracts**: Last 7 days (sam.gov limitation)
- **Market/Crypto**: Last 24 hours

## Manual Verification

To verify the cron ran successfully:

```powershell
# Check Netlify logs
# Netlify Dashboard → Functions → Logs

# Or trigger manually to test
./trigger-newsletter.ps1
```

Expected output:
```json
{
  "success": true,
  "sent": 47,
  "failed": 0,
  "duration": "182.34s",
  "errors": []
}
```

## Related Files

- **Main Function**: [`netlify/functions/send-newsletters-background.mjs`](netlify/functions/send-newsletters-background.mjs)
- **Netlify Config**: [`netlify.toml`](netlify.toml)
- **GitHub Action**: [`.github/workflows/daily-newsletter.yml`](.github/workflows/daily-newsletter.yml)
- **Manual Trigger**: [`trigger-newsletter.ps1`](trigger-newsletter.ps1)
- **Data Sources**: [`netlify/functions/_lib/`](netlify/functions/_lib/)

## Environment Variables Required

```bash
# Authentication
CRON_SECRET=<random-32-char-string>

# Email Service
RESEND_API_KEY=<resend-api-key>
FROM_EMAIL=digest@yourdomain.com
AUDIENCE_ID=<resend-audience-id>

# AI Service
OPENAI_API_KEY=<openai-api-key>

# Data Sources (various API keys)
# See .env.example for full list
```

---

**Last Updated**: March 9, 2026  
**Current Schedule**: 05:30 UTC Daily
