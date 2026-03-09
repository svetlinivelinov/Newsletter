# AI Early Signal Intelligence Newsletter

Production-ready intelligence newsletter platform deployed on Netlify. Monitors 16+ data sources including GDELT global events, press releases, Google News, and REDDIT, with cross-source confirmation and intelligent signal scoring.

## Current Phase: Phase 4 — Multi-Source Intelligence

**Status:** ✅ Production-ready with real-time signal detection
**Sources:** 16+ including GDELT, press releases, Google News, REDDIT (optional), RSS, EDGAR, contracts, crypto, stocks  
**Intelligence:** Cross-source confirmation, severity scoring, deduplication  
**Storage:** Netlify Blobs  
**Cron:** Daily digest at 05:30 UTC via GitHub Actions + Netlify

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your API keys in .env
# Required for Phase 1:
# - OPENAI_API_KEY
# - EMAIL_API_KEY (Resend)
# - BING_SEARCH_API_KEY
# - FRED_API_KEY
# - FINNHUB_API_KEY
# - SAM_GOV_API_KEY
# - CRON_SECRET
# - UNSUBSCRIBE_SECRET

# Start local development server
npm run dev

# Test subscription
curl -X POST http://localhost:8888/.netlify/functions/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Test daily digest (manual trigger)
curl -X POST http://localhost:8888/.netlify/functions/send-newsletters \
  -H "x-cron-secret: your_secret"
```

## Deploy to Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login and link project
netlify login
netlify init

# Set environment variables in Netlify dashboard
# Or via CLI:
netlify env:set OPENAI_API_KEY "your-key"
netlify env:set EMAIL_API_KEY "your-key"
# ... repeat for all required vars

# Deploy
netlify deploy --prod
```

## Project Structure

```
project-root/
├── netlify.toml              # Netlify config with cron schedule
├── package.json              # Dependencies
├── .env.example              # Environment variables template
├── index.html                # Subscription landing page
└── netlify/
    └── functions/
        ├── subscribe.mjs         # POST /subscribe
        ├── unsubscribe.mjs       # GET /unsubscribe?token=xxx
        ├── send-newsletters.mjs  # CRON daily digest 05:30 UTC
        └── _lib/                 # Shared library modules
            ├── news.mjs          # Bing Search
            ├── rss.mjs           # RSS parser + Google News
            ├── regional.mjs      # Regional RSS feeds
            ├── gdelt.mjs         # GDELT 15-min event feed
            ├── press.mjs         # Press release wires
            ├── reddit.mjs       # Reddit search (optional)
            ├── macro.mjs         # FRED API
            ├── contracts.mjs     # SAM.gov + USASpending
            ├── edgar.mjs         # SEC EDGAR
            ├── crypto.mjs        # CoinGecko
            ├── market.mjs        # Finnhub
            ├── watchlist.mjs     # Cross-source filtering
            ├── db.mjs            # Netlify Blobs wrapper
            ├── ai.mjs            # OpenAI generation
            ├── email.mjs         # Resend sender
            └── token.mjs         # HMAC tokens
```

## API Cost Reference

| Service | Cost | Key Required | Rate Limit |
|---------|------|--------------|------------|
| RSS feeds (all) | ✅ Free | ❌ None | Unlimited |
| USASpending.gov | ✅ Free | ❌ None | Generous |
| SEC EDGAR | ✅ Free | ❌ None* | 10 req/sec |
| CoinGecko | ✅ Free | ❌ None | 30 calls/min |
| FRED | ✅ Free | ✅ Instant | 120 req/min |
| SAM.gov | ✅ Free | ✅ 1-10 days | 1,000 req/day |
| Finnhub | ✅ Free | ✅ Instant | 60 calls/min |
| Netlify Blobs | ✅ Free | Built-in | — |
| Resend | 💰 $0-20/mo | ✅ Yes | 3K-50K emails/mo |
| Bing Search | 💰 Paid | ✅ Yes | Per plan |
| OpenAI | 💰 Paid | ✅ Yes | Per plan |

*EDGAR requires User-Agent header, not an API key.

## Data Sources

**Early Signals (Phase 4 — ✅ Implemented):**
- 🌍 **GDELT** — 15-minute global event feed (protest, conflict, cyberattack, emergency)
- 📢 **Press Releases** — PRNewswire, BusinessWire, GlobeNewswire (M&A, earnings, FDA, SEC)
- 📰 **Google News** — Top stories, World, Business, Technology
- ⚡ **REDDIT** — Real-time breaking news (optional, via script-app OAuth credentials)

**Intelligence Sources (Phase 1):**
- 📊 **Financial Markets** — Finnhub stock signals, CoinGecko crypto signals
- 🏛️ **Government** — SEC EDGAR filings, SAM.gov contracts, USASpending awards
- 📈 **Macro** — FRED indicators (inflation, employment, GDP)
- 🗺️ **Regional** — Bulgaria, EU, NATO dedicated feeds
- 📰 **News** — Bing Search, RSS newswires, central banks

**Signal Processing:**
- Cross-source confirmation (when 2+ sources report same event → +30 to +60 score boost)
- Severity scoring (normalized 0-100 scale)
- Intelligent deduplication (URL, ID, title similarity)
- CAMEO event code filtering for GDELT
- Keyword-based filtering for press/news/posts

## Next Steps

**Phase 2** (Breaking Alerts):
- Real-time TIER 1 signal alerts every 30 minutes
- Upstash Redis for deduplication

**Phase 3** (Preferences & History):
- Midday signal bundle
- Subscriber preferences (choose alert tiers)
- Supabase database + send history

## License

ISC
