# Copilot Instructions — AI Early Signal Intelligence Newsletter

You are building a production-ready intelligence newsletter platform deployed on Netlify.
The system monitors 12+ data sources simultaneously, detects market-moving signals before
mainstream media, and delivers them to subscribers via a 3-tier alert system:
- **TIER 1** — Breaking alerts sent immediately when critical signals fire
- **TIER 2** — Midday bundle of notable signals queued since morning
- **TIER 3** — Morning digest of everything else, sent daily at 07:00 UTC

The architecture is designed to be built in 3 phases. Each phase is independently deployable.
Always generate code for the phase currently active unless the user specifies otherwise.

---

## 0. THREE-PHASE ROLLOUT PLAN

### Phase 1 — Daily Digest (Build This First)
**Goal:** Working newsletter with all data sources, sent once per day.
**Storage:** Netlify Blobs only.
**Cron:** 1 job — daily digest at 07:00 UTC.
**Complexity:** Low. No alert logic. No deduplication needed.

### Phase 2 — Breaking Alerts (Add After Phase 1 Works)
**Goal:** Immediate alerts for TIER 1 signals (rate decisions, major M&A, crisis events).
**Storage:** Netlify Blobs (subscribers) + Upstash Redis (dedup flags + signal queue).
**Cron:** 2 jobs — signal check every 30 min + daily digest at 07:00 UTC.
**New functions:** `check-signals.mjs`, `send-alert.mjs`
**New lib:** `_lib/hotness.mjs`, `_lib/redis.mjs`

### Phase 3 — Full Intelligence Platform (Add After Phase 2 Works)
**Goal:** Subscriber preferences, midday bundle, send history, web dashboard.
**Storage:** Supabase Postgres (subscribers + history) + Upstash Redis (queue + dedup).
**Cron:** 3 jobs — signal check every 30 min + midday bundle at 13:00 UTC + daily at 07:00 UTC.
**New functions:** `send-midday.mjs`, `preferences.mjs`
**New lib:** `_lib/supabase.mjs`
**Frontend:** Add preferences page where subscribers choose alert tiers they want.

---

## 1. TECHNOLOGY STACK

| Layer              | Phase | Technology                                                  |
|--------------------|-------|-------------------------------------------------------------|
| Frontend           | 1     | HTML5, TailwindCSS CDN, Vanilla JS                          |
| Backend            | 1     | Netlify Functions (serverless, Node.js 20)                  |
| Primary storage    | 1     | Netlify Blobs (`@netlify/blobs`) — subscribers              |
| Signal queue/dedup | 2     | Upstash Redis — free tier (10K req/day, 256MB)              |
| Full database      | 3     | Supabase Postgres — free tier (500MB, 2 projects)           |
| Email              | 1     | Resend API — free tier (3,000 emails/month)                 |
| AI generation      | 1     | OpenAI API (`gpt-4o` default, `gpt-5-mini` cost option)     |
| General news       | 1     | Bing Search API v7                                          |
| Early bird RSS     | 1     | GlobeNewswire, BusinessWire, PR Newswire, Fed, ECB, BIS     |
| Macro calendar     | 1     | FRED API — St. Louis Fed (free, instant key)                |
| Contract signals   | 1     | SAM.gov API (free, registration required)                   |
| Contract awards    | 1     | USASpending.gov API (free, no key)                          |
| SEC filings        | 1     | SEC EDGAR API (free, no key)                                |
| Crypto signals     | 1     | CoinGecko API (free Demo, 30 calls/min)                     |
| Stock signals      | 1     | Finnhub API (free, 60 calls/min)                            |
| Regional intel     | 1     | BTA (Bulgaria), Novinite, BNB, EU Commission, NATO — free RSS|

---

## 2. PROJECT STRUCTURE (ALL PHASES)

```
project-root/
├── netlify.toml                     # Cron schedules (grows per phase)
├── .env.example                     # All env vars documented
├── package.json
├── index.html                       # Subscription landing page
├── preferences.html                 # [Phase 3] Subscriber preferences page
└── netlify/
    └── functions/
        ├── subscribe.mjs            # POST   /subscribe
        ├── unsubscribe.mjs          # GET    /unsubscribe?token=xxx
        ├── preferences.mjs          # POST   /preferences  [Phase 3]
        ├── send-newsletters.mjs     # CRON   daily digest  07:00 UTC
        ├── check-signals.mjs        # CRON   every 30min   [Phase 2+]
        ├── send-alert.mjs           # INTERNAL called by check-signals [Phase 2+]
        ├── send-midday.mjs          # CRON   midday bundle 13:00 UTC   [Phase 3]
        └── _lib/
            │
            │  ── DATA SOURCES ──
            ├── news.mjs             # Bing Search — general headlines
            ├── rss.mjs              # RSS parser — newswires + central banks
            ├── regional.mjs         # Region-specific RSS feeds (Bulgaria, EU, NATO etc.)
            ├── macro.mjs            # FRED API — macro indicators + calendar
            ├── contracts.mjs        # SAM.gov + USASpending.gov
            ├── edgar.mjs            # SEC EDGAR — 8-K, S-1, 13F, Form 4
            ├── crypto.mjs           # CoinGecko — prices, volume, OHLCV
            ├── market.mjs           # Finnhub — quotes, insider trades, earnings
            │
            │  ── INTELLIGENCE ──
            ├── hotness.mjs          # Signal scoring engine (TIER 1/2/3) [Phase 2+]
            ├── watchlist.mjs        # Cross-source company/coin/ticker filter
            │
            │  ── INFRASTRUCTURE ──
            ├── db.mjs               # Netlify Blobs wrapper [Phase 1+]
            ├── redis.mjs            # Upstash Redis wrapper [Phase 2+]
            ├── supabase.mjs         # Supabase Postgres wrapper [Phase 3]
            ├── ai.mjs               # OpenAI newsletter + alert generation
            ├── email.mjs            # Resend sender (digest + alert templates)
            └── token.mjs            # HMAC token sign/verify
```

---

## 3. ENVIRONMENT VARIABLES

All phases use the same `.env.example`. Variables marked [P2] and [P3] are only needed
for those phases but should be documented from the start.

```dotenv
# ─── AI ───────────────────────────────────────────────────────────────────────
OPENAI_API_KEY=                     # OpenAI secret key
OPENAI_MODEL=gpt-4o                 # gpt-4o | gpt-5-mini

# ─── EMAIL ────────────────────────────────────────────────────────────────────
EMAIL_API_KEY=                      # Resend API key
EMAIL_FROM=digest@yourdomain.com    # Verified sender address

# ─── SECURITY ─────────────────────────────────────────────────────────────────
CRON_SECRET=                        # Protects all cron-triggered endpoints
UNSUBSCRIBE_SECRET=                 # HMAC secret for unsubscribe tokens
PREFERENCES_SECRET=                 # HMAC secret for preferences tokens [P3]

# ─── LIMITS ───────────────────────────────────────────────────────────────────
MAX_SUBSCRIBERS=500                 # Hard cap (raise per phase)
MAX_TIER1_ALERTS_PER_DAY=5          # Max breaking alerts per day [P2]

# ─── NEWS & SEARCH ────────────────────────────────────────────────────────────
BING_SEARCH_API_KEY=                # Bing Search v7

# ─── INTELLIGENCE APIs (all free) ─────────────────────────────────────────────
SAM_GOV_API_KEY=                    # sam.gov — free, register at sam.gov
EDGAR_USER_AGENT=AppName admin@yourdomain.com  # Required by SEC policy
FINNHUB_API_KEY=                    # finnhub.io — free, instant signup
FRED_API_KEY=                       # fred.stlouisfed.org — free, instant signup
# CoinGecko, USASpending, EDGAR, all RSS feeds — no keys required

# ─── WATCHLIST ────────────────────────────────────────────────────────────────
WATCHED_COMPANIES=Palantir,Anduril,Microsoft,Lockheed Martin,Scale AI
WATCHED_STOCKS=PLTR,MSFT,LMT       # Finnhub tickers
WATCHED_CRYPTOS=bitcoin,ethereum,solana  # CoinGecko IDs

# ─── REGIONAL INTELLIGENCE ────────────────────────────────────────────────────
# Comma-separated country/region codes to enable targeted RSS feeds
# Supported: BG (Bulgaria), EU, NATO, DE (Germany), FR (France), UK, US
WATCHED_REGIONS=BG,EU,NATO

# Bulgaria-specific (active when BG is in WATCHED_REGIONS)
# No keys required — all free public RSS feeds
# BG_BNB_RSS, BG_BTA_RSS etc. are hardcoded in regional.mjs — no config needed

# EU-specific — European Commission + Parliament feeds
# Active when EU is in WATCHED_REGIONS — no keys required

# ─── CUSTOM RSS ───────────────────────────────────────────────────────────────
EXTRA_RSS_FEEDS=                    # Optional comma-separated extra RSS URLs

# ─── STORAGE [Phase 2+] ───────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=             # From Upstash console [P2]
UPSTASH_REDIS_REST_TOKEN=           # From Upstash console [P2]

# ─── DATABASE [Phase 3] ───────────────────────────────────────────────────────
SUPABASE_URL=                       # From Supabase project settings [P3]
SUPABASE_ANON_KEY=                  # From Supabase project settings [P3]
```

---

## 4. STORAGE ARCHITECTURE BY PHASE

### Phase 1 — Netlify Blobs Only

```
Netlify Blobs
├── subscribers:{email}     → { email, subscribedAt, active: true }
└── meta:stats              → { totalSubscribers, lastDigestSentAt }
```

### Phase 2 — Netlify Blobs + Upstash Redis

```
Netlify Blobs (persistent, slow-changing)
├── subscribers:{email}     → { email, subscribedAt, active: true, tier: 'all' }
└── meta:stats              → { totalSubscribers, lastDigestSentAt }

Upstash Redis (ephemeral, fast, atomic)
├── alert:sent:{signalHash} → "1"  TTL: 24h   — dedup: was this alert already sent?
├── signal:queue            → JSON array       — TIER 2 items waiting for midday bundle
├── check:last-run          → ISO timestamp    — when did check-signals last run?
└── alert:count:{date}      → number  TTL: 24h — how many alerts sent today?
```

### Phase 3 — Supabase + Upstash Redis

```
Supabase Postgres (source of truth)
├── subscribers    → id, email, created_at, active, preferences (jsonb)
├── send_log       → id, subscriber_id, type, sent_at, subject, signal_tier
└── signal_log     → id, source, title, url, hotness_score, fired_at

Upstash Redis (ephemeral cache — same as Phase 2)
```

**Key rule:** In Phase 3, Netlify Blobs is retired. Supabase becomes the subscriber store.
Redis remains ephemeral only — never store persistent data in Redis.

---

## 5. SIGNAL HOTNESS SCORING ENGINE (`_lib/hotness.mjs`) [Phase 2+]

This is the intelligence brain of the system. Scores every signal 0–100 and assigns a tier.
All scoring logic lives here — no scoring anywhere else.

```js
const TIER_1_THRESHOLD = 80;  // Send immediately as breaking alert
const TIER_2_THRESHOLD = 50;  // Queue for midday bundle
// Below 50 = TIER 3 — held for morning digest

const HOTNESS_RULES = [
  // ── TIER 1 (score 80–100) — send immediately ──────────────────────────────
  { source: 'fed_rss',      keyword:  'rate decision',           score: 100 },
  { source: 'fed_rss',      keyword:  'emergency meeting',       score: 100 },
  { source: 'ecb_rss',      keyword:  'rate decision',           score: 100 },
  { source: 'who_rss',      keyword:  'public health emergency', score: 100 },
  { source: 'edgar_8k',     watchlistHit: true,                  score: 95  },
  { source: 'newswire',     keyword:  'acquires',                score: 90  },
  { source: 'newswire',     keyword:  'merger agreement',        score: 90  },
  { source: 'newswire',     keyword:  'bankruptcy',              score: 88  },
  { source: 'crypto',       signal:   'VOLUME_SPIKE_3X',         score: 85  },
  { source: 'macro',        signal:   'YIELD_CURVE_INVERTED',    score: 85  },
  { source: 'newswire',     watchlistHit: true,                  score: 82  },

  // ── TIER 2 (score 50–79) — queue for midday ───────────────────────────────
  { source: 'stock',        signal:   'EARNINGS_APPROACHING',    score: 75  },
  { source: 'stock',        signal:   'INSIDER_BUYING',          score: 72  },
  { source: 'crypto',       signal:   'STRONG_MOVE_10PCT',       score: 70  },
  { source: 'edgar_s1',     any: true,                           score: 68  },
  { source: 'sam_gov',      watchlistHit: true,                  score: 65  },
  { source: 'stock',        signal:   'UNDERVALUED_VS_TARGET',   score: 60  },
  { source: 'macro',        signal:   'INFLATION_ELEVATED',      score: 55  },
  { source: 'newswire',     keyword:  'partnership',             score: 52  },

  // ── REGIONAL TIER 1 triggers ──────────────────────────────────────────────
  { source: 'bnb_rss',      keyword:  'euro adoption',           score: 100 },
  { source: 'bnb_rss',      keyword:  'monetary policy',         score: 88  },
  { source: 'ec_press',     keyword:  'sanctions',               score: 95  },
  { source: 'ec_press',     keyword:  'antitrust',               score: 90  },
  { source: 'nato_news',    keyword:  'Article 5',               score: 100 },
  { source: 'nato_news',    keyword:  'contract award',          score: 85  },
  { source: 'defence_news', watchlistHit: true,                  score: 88  },

  // ── REGIONAL TIER 2 triggers ──────────────────────────────────────────────
  { source: 'bta_rss',      watchlistHit: true,                  score: 72  },
  { source: 'euractiv',     keyword:  'regulation',              score: 65  },
  { source: 'seenews',      watchlistHit: true,                  score: 68  },
  { source: 'eu_council',   keyword:  'directive',               score: 60  },
  { source: 'nato_news',    keyword:  'exercise',                score: 55  },
  // Default unmatched = 30 (TIER 3)
];
```

**Deduplication:**
- Hash = `sha256(source + title + pubDate)`
- Before alert: check Redis `alert:sent:{hash}` — exists? Skip.
- After alert: set key with 24h TTL

**Rate limiting:**
- Check Redis `alert:count:{today}` before each TIER 1 send
- If count >= `MAX_TIER1_ALERTS_PER_DAY` → downgrade to TIER 2
- Prevents subscriber fatigue on high-volatility days

---

## 6. SERVERLESS FUNCTIONS

### 6.1 `subscribe.mjs` — POST /subscribe

- Accept: `{ email, preferences? }` — preferences defaults to `{ tiers: ['digest'] }`
- Validate email regex → `400`
- Sanitize: trim + lowercase
- Duplicate check → `409`
- Cap check → `429`
- Store in Netlify Blobs (P1/P2) or Supabase (P3)
- Return `201`

### 6.2 `unsubscribe.mjs` — GET /unsubscribe?token=xxx

- Verify HMAC token
- Delete from storage
- Return branded HTML confirmation
- Return `400` for bad tokens

### 6.3 `preferences.mjs` — POST /preferences [Phase 3]

- Verify HMAC token, extract email
- Update `preferences.tiers` in Supabase
- Return `200` HTML confirmation

### 6.4 `send-newsletters.mjs` — Daily Digest Cron (07:00 UTC)

- Verify `x-cron-secret` → `401`
- Fetch all sources in parallel via `Promise.allSettled()`:
  `news, rss, regional, macro, contracts, edgar, crypto, market`
- Run `watchlist.mjs`
- [P2+] Filter out items already sent today (Redis dedup check)
- All empty → abort, do not call OpenAI
- Call `ai.mjs` with `type: 'digest'`
- Load subscribers — [P3] filter by `tiers` including `'digest'`
- Send loop with per-email try/catch
- [P3] Log to `send_log`
- Return `{ sent, failed, errors }`

### 6.5 `check-signals.mjs` — Signal Check Cron (every 30 min) [Phase 2+]

- Verify `x-cron-secret` → `401`
- Fetch fast-moving sources ONLY (no Bing — quota; no SAM.gov — too slow):
  `rss.mjs, regional.mjs, edgar.mjs (8-K only), crypto.mjs, market.mjs`
- Score every item via `hotness.mjs`
- TIER 1 items: check dedup → check rate limit → call `send-alert.mjs` → set dedup key
- TIER 2 items: check dedup → push to Redis queue → set dedup key
- Update `check:last-run`
- Return `{ tier1Fired, tier2Queued, skipped }`

### 6.6 `send-alert.mjs` — Breaking Alert Sender [Phase 2+]

- Internal only — never expose as public HTTP endpoint
- Called by `check-signals.mjs` with a single signal object
- Call `ai.mjs` with `type: 'alert'`
- Load all subscribers — [P3] filter by `tiers` including `'alerts'`
- Subject: `🚨 Breaking: {SIGNAL_TYPE} — {headline}`
- Send loop with per-email try/catch
- [P3] Log to `send_log`

### 6.7 `send-midday.mjs` — Midday Bundle Cron (13:00 UTC) [Phase 3]

- Verify `x-cron-secret` → `401`
- Load + atomically clear Redis `signal:queue`
- Queue empty → return early, no email sent
- Call `ai.mjs` with `type: 'midday'`
- Send to subscribers with `tiers` including `'midday'`
- Log to `send_log`

---

## 7. DATA SOURCE MODULES

### 7.1 `_lib/news.mjs` — Bing Search

- Read `WATCHED_REGIONS` env var to build dynamic search queries
- Fetch in parallel:
  - Global news
  - Technology news
  - Economy & Markets news
  - Regional news — one Bing query per region in `WATCHED_REGIONS`
    e.g. `WATCHED_REGIONS=BG,EU` → query `"Bulgaria news"` + `"European Union news"` in parallel
- Each item: `{ title, description, url, source, pubDate, region? }`
- Omit any item without a `url`

### 7.2 `_lib/regional.mjs` — Region-Specific RSS Intelligence

This module loads a curated set of authoritative RSS feeds per region based on `WATCHED_REGIONS`.
It runs **in addition to** `rss.mjs` — these are targeted local sources, not global newswires.
Parse with `fast-xml-parser`. All feeds are free, no API keys required.
Filter to items published within the last 24 hours.

**Region registry — hardcoded feed map:**

```js
const REGIONAL_FEED_REGISTRY = {

  // ── BULGARIA (BG) ──────────────────────────────────────────────────────────
  BG: [
    // BTA — Official Bulgarian News Agency (English edition)
    // Covers: politics, economy, business, EU affairs, energy
    // Signal value: HIGH — official state newswire, fastest English source for BG news
    { name: 'BTA English',      url: 'https://www.bta.bg/en/rss',                             tier: 'national_news'  },

    // Novinite — Independent English-language Bulgarian news
    // Covers: business, politics, crime, EU, Balkans
    // Signal value: MEDIUM — good secondary source, faster than international press
    { name: 'Novinite',         url: 'https://www.novinite.com/rss.php',                      tier: 'national_news'  },

    // Bulgarian National Bank — monetary policy, banking sector, Euro adoption timeline
    // Signal value: HIGH for finance — BNB lev/euro peg news is market-moving
    { name: 'BNB Press',        url: 'https://www.bnb.bg/PressOffice/POPressReleases/index.htm', tier: 'central_bank' },

    // SeeNews — Southeast Europe business & financial news (covers BSE-Sofia)
    // Signal value: MEDIUM — best English source for Bulgarian listed companies
    { name: 'SeeNews Bulgaria', url: 'https://seenews.com/rss/bulgaria',                      tier: 'financial'      },

    // Balkan Insight — investigative, EU rule-of-law, anticorruption
    // Signal value: MEDIUM — useful for regulatory risk signals
    { name: 'Balkan Insight',   url: 'https://balkaninsight.com/feed/',                       tier: 'regional_news'  },
  ],

  // ── EUROPEAN UNION (EU) ────────────────────────────────────────────────────
  EU: [
    // European Commission — regulations, directives, sanctions, trade decisions
    // Signal value: VERY HIGH — source of all EU law, directly market-moving
    { name: 'EC Press Releases', url: 'https://ec.europa.eu/commission/presscorner/api/rss',  tier: 'regulatory'     },

    // European Parliament — legislative updates, committee votes
    // Signal value: HIGH — early view of upcoming regulations
    { name: 'EU Parliament News',url: 'https://www.europarl.europa.eu/rss/doc/top-stories/en.rss', tier: 'regulatory'},

    // EU Council — final law adoption, foreign policy decisions
    { name: 'EU Council',        url: 'https://www.consilium.europa.eu/en/feed/',             tier: 'regulatory'     },

    // Euractiv — leading EU policy news, best for early legislative signals
    // Signal value: HIGH — specialist publication, often ahead of mainstream press
    { name: 'Euractiv',          url: 'https://www.euractiv.com/feed/',                       tier: 'policy_news'    },

    // ECB already in rss.mjs — do not duplicate here
  ],

  // ── NATO ───────────────────────────────────────────────────────────────────
  NATO: [
    // NATO official news — defence contracts, new members, exercises, policy
    // Signal value: HIGH for defence stocks — procurement signals, alliance expansion
    { name: 'NATO News',         url: 'https://www.nato.int/cps/en/natohq/news.rss',          tier: 'defence'        },

    // NATO Secretary General statements — highest priority political signals
    { name: 'NATO SG Statements',url: 'https://www.nato.int/cps/en/natohq/opinions.rss',     tier: 'defence'        },

    // Defense News — global defence industry, procurement, contracts
    // Signal value: HIGH for defence watchlist companies (Palantir, Anduril, Lockheed)
    { name: 'Defense News',      url: 'https://www.defensenews.com/arc/outboundfeeds/rss/',   tier: 'defence'        },

    // Breaking Defense — fastest defence industry news
    { name: 'Breaking Defense',  url: 'https://breakingdefense.com/feed/',                    tier: 'defence'        },
  ],

  // ── GERMANY (DE) ──────────────────────────────────────────────────────────
  DE: [
    { name: 'Deutsche Welle Business', url: 'https://rss.dw.com/rdf/rss-en-bus',             tier: 'national_news'  },
    { name: 'Bundesbank',              url: 'https://www.bundesbank.de/dynamic/action/en/presse/pressemitteilungen/832840/rss.rss', tier: 'central_bank' },
  ],

  // ── UNITED KINGDOM (UK) ───────────────────────────────────────────────────
  UK: [
    { name: 'Bank of England',   url: 'https://www.bankofengland.co.uk/rss/news',             tier: 'central_bank'   },
    { name: 'UK Gov News',       url: 'https://www.gov.uk/search/news-and-communications.atom', tier: 'regulatory'   },
  ],

  // ── FRANCE (FR) ───────────────────────────────────────────────────────────
  FR: [
    { name: 'Banque de France',  url: 'https://www.banque-france.fr/en/rss-feeds',            tier: 'central_bank'   },
  ],

};
```

**Implementation rules:**
- Read `WATCHED_REGIONS` env var, split by comma, trim, uppercase
- Load only feeds for active regions — skip all others
- Fetch all active feeds in parallel via `Promise.allSettled()`
- Add 100ms delay between requests per domain (politeness)
- Tag every item with its `region` code and `tier`
- Apply same `SIGNAL_KEYWORDS` detection from `rss.mjs`
- Also flag any item mentioning companies from `WATCHED_COMPANIES`
- If `EXTRA_RSS_FEEDS` env var is set, parse and add those URLs with `tier: 'custom'`

Return: `{ regionalItems: [{ title, description, url, source, region, tier, pubDate, signals: [], isWatchlistHit: bool }] }`

**Bulgaria-specific signal keywords** — add to detection when BG is active:
```js
const BG_SIGNAL_KEYWORDS = {
  EURO_ADOPTION:    ['euro adoption', 'ERM II', 'eurozone', 'lev', 'BGN'],
  ENERGY_TRANSIT:   ['gas pipeline', 'TurkStream', 'energy corridor', 'Bulgartransgaz'],
  EU_FUNDS:         ['cohesion fund', 'EU funds', 'structural funds', 'recovery plan'],
  BANKING:          ['BNB', 'Bulgarian National Bank', 'banking sector', 'DSK', 'UniCredit Bulbank'],
  BSE_LISTED:       ['Sopharma', 'First Investment Bank', 'Eurohold', 'Bulgarian Energy Holding'],
  RULE_OF_LAW:      ['corruption', 'rule of law', 'judicial reform', 'OLAF'],
};
```

**NATO/Defence-specific signal keywords** — add when NATO is active:
```js
const NATO_SIGNAL_KEYWORDS = {
  DEFENCE_CONTRACT: ['contract award', 'procurement', 'billion', 'defence spending'],
  ALLIANCE_NEWS:    ['Article 5', 'collective defence', 'enlargement', 'accession'],
  EXERCISE:         ['military exercise', 'NATO exercise', 'joint exercise'],
};
```

### 7.2 `_lib/rss.mjs` — Early Bird RSS

Parse with `fast-xml-parser`. Parallel fetch via `Promise.allSettled()`.
Filter to items published within the last 24 hours.

```js
const RSS_FEEDS = [
  { name: 'GlobeNewswire',   url: 'https://www.globenewswire.com/RssFeed/industry/9144-technology', tier: 'newswire'    },
  { name: 'BusinessWire',    url: 'https://feed.businesswire.com/rss/home/?rss=G1',                 tier: 'newswire'    },
  { name: 'PR Newswire',     url: 'https://www.prnewswire.com/rss/news-releases-list.rss',          tier: 'newswire'    },
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml',             tier: 'central_bank'},
  { name: 'ECB',             url: 'https://www.ecb.europa.eu/rss/press.html',                       tier: 'central_bank'},
  { name: 'BIS',             url: 'https://www.bis.org/doclist/cbspeeches.rss',                     tier: 'central_bank'},
  { name: 'WHO',             url: 'https://www.who.int/rss-feeds/news-english.xml',                 tier: 'geo'         },
  { name: 'UN Press',        url: 'https://press.un.org/en/rss.xml',                               tier: 'geo'         },
  { name: 'Federal Register',url: 'https://www.federalregister.gov/api/v1/articles.rss?conditions[publication_date][gte]=TODAY', tier: 'regulatory' },
];
```

Keyword signal tagging:
```js
const SIGNAL_KEYWORDS = {
  MERGER_ACQUISITION: ['acquires', 'acquisition', 'merger', 'takeover'],
  EARNINGS:           ['earnings', 'quarterly results', 'revenue', 'EPS'],
  RATE_DECISION:      ['rate decision', 'basis points', 'rate cut', 'rate hike'],
  MAJOR_CONTRACT:     ['awarded contract', 'wins contract', 'procurement award'],
  REGULATORY_ACTION:  ['SEC charges', 'antitrust', 'fine', 'ban', 'sanction'],
  GEOPOLITICAL:       ['sanctions', 'tariff', 'trade war', 'conflict', 'invasion'],
  BANKRUPTCY:         ['bankruptcy', 'chapter 11', 'insolvency'],
  EMERGENCY:          ['emergency', 'outbreak', 'crisis'],
};
```

Return: `{ earlyBirdItems: [...], centralBankItems: [...] }`
Each item: `{ title, description, url, source, tier, pubDate, signals: [], isWatchlistHit: bool }`

### 7.3 `_lib/macro.mjs` — FRED Macro Calendar

Base URL: `https://api.stlouisfed.org/fred/`

```js
const MACRO_SERIES = [
  { id: 'CPIAUCSL',    name: 'CPI Inflation',       impact: 'VERY_HIGH' },
  { id: 'UNRATE',      name: 'Unemployment Rate',   impact: 'VERY_HIGH' },
  { id: 'FEDFUNDS',    name: 'Fed Funds Rate',      impact: 'VERY_HIGH' },
  { id: 'GDP',         name: 'GDP Growth',          impact: 'HIGH'      },
  { id: 'T10Y2Y',      name: 'Yield Curve 10Y-2Y',  impact: 'HIGH'      },
  { id: 'DCOILWTICO',  name: 'Crude Oil WTI',       impact: 'MEDIUM'    },
  { id: 'DEXUSEU',     name: 'USD/EUR Rate',        impact: 'MEDIUM'    },
];
```

Signals detected in code:
- `YIELD_CURVE_INVERTED` if T10Y2Y < 0
- `INFLATION_ELEVATED` if CPI > 3%
- `TREND_REVERSAL` if value shifted > 10% vs previous
- `RELEASE_APPROACHING` if release date within 7 days

Return: `{ indicators: [...], upcomingReleases: [...] }`

### 7.4 `_lib/contracts.mjs` — SAM.gov + USASpending.gov

SAM.gov — Sources Sought → `signalTier: 'early'`; open RFPs → `signalTier: 'active'`
NAICS codes: `541512, 541511, 336411, 541330` (defence/tech). Filter: last 24h.

USASpending.gov — confirmed awards last 24h, amount > $10M → `signalTier: 'awarded'`

Each item: `{ title, department, amount, signalTier, postedDate, responseDeadline, url, isWatchlistHit }`

### 7.5 `_lib/edgar.mjs` — SEC EDGAR

Header required: `User-Agent: ${process.env.EDGAR_USER_AGENT}`
150ms delay between requests. Max 10 req/sec.

Filing types: `8-K` (material events), `S-1` (IPO), `13F` (institutions), `4` (insider trades)

Return: `{ filings: [{ companyName, filingType, description, filingDate, url, isWatchlistHit }] }`

### 7.6 `_lib/crypto.mjs` — CoinGecko

No key. 30 calls/min. 200ms delay between coins.

Signals detected in code:
- `VOLUME_SPIKE_2X` / `VOLUME_SPIKE_3X` vs 7-day avg
- `STRONG_MOVE` (>±8%) / `STRONG_MOVE_10PCT` (>±10%)
- `UPTREND` / `DOWNTREND` — 3 consecutive closes

Return per coin: `{ id, name, price, change24h, volume24h, marketCap, signals: [], priceHistory: [] }`

### 7.7 `_lib/market.mjs` — Finnhub

Auth: `?token=${FINNHUB_API_KEY}`. 100ms delay between tickers.

Signals:
- `UNDERVALUED_VS_TARGET` — price > 15% below analyst consensus
- `EARNINGS_APPROACHING` — within 7 days
- `INSIDER_BUYING` — net positive insider trades last 30 days
- `STRONG_DAY_MOVE` — day change > ±3%

Return per ticker: `{ symbol, price, changePercent, analystTarget, signals: [], earningsDate, insiderActivity }`

### 7.8 `_lib/watchlist.mjs`

- Parse `WATCHED_COMPANIES`, `WATCHED_STOCKS`, `WATCHED_CRYPTOS`, `WATCHED_REGIONS` from env
- Case-insensitive match across ALL source results including `regionalItems`
- For BG region: also match against `BSE_LISTED` companies hardcoded in `regional.mjs`
- Deduplicate by URL
- Tag each hit with its `region` if applicable
- Return: `{ watchlistHits: [{ company, signal, source, region?, signalTier, url, pubDate }] }`

### 7.9 `_lib/hotness.mjs` [Phase 2+]

```js
export const scoreSignal = (item) => { ... }      // returns { score, tier }
export const generateHash = (item) => { ... }     // sha256(source+title+pubDate)
```

### 7.10 `_lib/db.mjs` — Netlify Blobs

```js
export const getSubscriber    = async (email) => {...}
export const saveSubscriber   = async (email, data) => {...}
export const deleteSubscriber = async (email) => {...}
export const listSubscribers  = async () => {...}
export const getStats         = async () => {...}
export const saveStats        = async (stats) => {...}
```

### 7.11 `_lib/redis.mjs` — Upstash Redis [Phase 2+]

```js
export const isAlertSent          = async (hash) => {...}
export const markAlertSent        = async (hash) => {...}   // 24h TTL
export const getAlertCount        = async (date) => {...}
export const incrementAlertCount  = async (date) => {...}   // atomic
export const queueSignal          = async (item) => {...}
export const flushQueue           = async () => {...}       // get + clear atomically
export const setLastRun           = async (ts) => {...}
export const getLastRun           = async () => {...}
```

If Redis is unavailable → log warning, skip dedup, continue (fail-open for Phase 2).

### 7.12 `_lib/supabase.mjs` — Supabase [Phase 3]

```js
export const getSubscriber       = async (email) => {...}
export const saveSubscriber      = async (email, data) => {...}
export const deleteSubscriber    = async (email) => {...}
export const listSubscribers     = async (tierFilter?) => {...}
export const updatePreferences   = async (email, prefs) => {...}
export const logSend             = async (subscriberId, type, subject, tier) => {...}
```

### 7.13 `_lib/ai.mjs`

```js
// type: 'digest' → full 10-section morning newsletter HTML
// type: 'alert'  → 3–5 sentence breaking alert HTML
// type: 'midday' → 3–5 item midday bundle HTML
export default async function generateContent(type, data) { ... }
// data shape: { news, earlyBird, regional, macro, contracts, edgarFilings,
//               cryptoSignals, marketSignals, watchlistHits }
```

If all data empty → throw error, never call OpenAI.

### 7.14 `_lib/email.mjs`

Three templates: `digest`, `alert`, `midday`

Subject prefixes:
- Digest: `📰 Morning Intelligence — {date}`
- Alert:  `🚨 Breaking: {signalType} — {headline}`
- Midday: `📡 Midday Signals — {date}`

Always include: plain-text alternative, signed unsubscribe link, [P3] preferences link.

### 7.15 `_lib/token.mjs`

```js
export const signToken   = (email, secret) => { ... }  // base64(email):hmac
export const verifyToken = (token, secret) => { ... }  // returns email | null
```

---

## 8. OPENAI PROMPTS

### 8.1 Digest (type: 'digest')

**System:**
```
You are a professional intelligence analyst and newsletter editor.
Write a daily briefing in clean HTML for email clients.
Use ONLY the provided data. Never invent or hallucinate facts.
If a section has no data write: <p>No updates today.</p>
Every item MUST have a source link: <a href="URL">[Source]</a>. Omit items without URLs.
No markdown. No inline styles.
```

**User:**
```
Generate today's intelligence digest using ONLY the data below.

Sections (use <h2> tags):
1.  🚨 Early Bird Signals       — newest first, label: <strong>[SOURCE NAME]</strong>
2.  🌍 Global News
3.  💻 Technology
4.  📈 Economy & Markets
5.  📅 Macro Calendar           — upcoming releases + active indicator signals
6.  🗺️  Regional Intelligence   — one sub-section per active region in the data
                                  e.g. <h3>🇧🇬 Bulgaria</h3>, <h3>🇪🇺 European Union</h3>, <h3>🛡️ NATO & Defence</h3>
                                  Only render sub-sections that have data. Skip empty regions.
                                  For Bulgaria: flag EURO_ADOPTION, ENERGY_TRANSIT, EU_FUNDS signals prominently.
                                  For NATO: flag defence contract awards and Article 5 news first.
7.  📋 Government Contracts     — label tier: <strong>[EARLY SIGNAL/ACTIVE RFP/AWARDED]</strong>
8.  🪙 Crypto Signals           — price, 24h change (green/red), detected signals
9.  📊 Stock Signals            — ticker, price, change, analyst target, signals
10. 🔭 Watchlist                — watchlistHits only; empty = "No watchlist activity today."
                                  Group by region if regionalhits present.

Rules:
- Sections 1–7: 3–5 items max per section/sub-section. Section 1: up to 8 items.
- Sections 8–10: facts only, no predictions, no buy/sell advice.
- End sections 8, 9, 10 with:
  <p><em>For informational purposes only. Not financial advice. Do your own research.</em></p>
- Never fabricate data not present below.
- Never render a section or sub-section that has no data.

DATA: {{JSON}}
```

### 8.2 Alert (type: 'alert')

**System:**
```
You are a breaking news analyst. Write a concise factual alert in HTML.
3–5 sentences max. Lead with the most important fact. No speculation.
```

**User:**
```
Write a breaking alert for this signal: {{SIGNAL_JSON}}

Format:
<h2>Brief headline</h2>
<p>What happened, why it matters, what to watch — facts only.</p>
<p>Source: <a href="URL">Source Name</a></p>
<p><em>Not financial advice.</em></p>
```

### 8.3 Midday Bundle (type: 'midday') [Phase 3]

**System:** Same as digest.

**User:**
```
Write a concise midday update from the signals below.
Title: "Notable signals since this morning". Max 5 items.
Each: signal type label + one sentence + source link.
DATA: {{QUEUE_JSON}}
```

---

## 9. `netlify.toml` BY PHASE

### Phase 1
```toml
[build]
  functions = "netlify/functions"
  publish   = "."

[functions]
  node_bundler = "esbuild"

[functions."send-newsletters"]
  schedule = "0 7 * * *"

[[headers]]
  for = "/.netlify/functions/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options        = "DENY"
```

### Phase 2 additions
```toml
[functions."check-signals"]
  schedule = "*/30 * * * *"
```

### Phase 3 additions
```toml
[functions."send-midday"]
  schedule = "0 13 * * *"
```

---

## 10. `package.json`

```json
{
  "type": "module",
  "dependencies": {
    "@netlify/blobs":        "^8.0.0",
    "@upstash/redis":        "^1.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "openai":                "^4.0.0",
    "resend":                "^3.0.0",
    "fast-xml-parser":       "^4.0.0"
  }
}
```

> Install all upfront. esbuild tree-shakes unused Phase 2/3 packages automatically.
> `@upstash/redis` and `@supabase/supabase-js` are inert if their env vars are absent.

---

## 11. SECURITY RULES

- Never hardcode any secret or API key
- Verify `x-cron-secret` on ALL cron endpoints — `401` immediately if wrong
- HMAC-sign all unsubscribe and preferences links — never raw email in URL
- Enforce `MAX_SUBSCRIBERS` — `429` when reached
- Rate-limit TIER 1 alerts via Redis counter (`MAX_TIER1_ALERTS_PER_DAY`)
- Every outbound email MUST include unsubscribe link (CAN-SPAM + GDPR)
- Set `User-Agent` on all EDGAR requests (SEC policy)
- `https://` for every external call — no exceptions

---

## 12. ERROR HANDLING RULES

- Every `async` function: `try/catch` — no uncaught rejections
- All parallel source fetches: `Promise.allSettled()` — one failure never aborts others
- Email send loops: per-email `try/catch` — one bad address never stops the batch
- OpenAI failure → abort, log, do NOT send empty email
- Redis unavailable [P2] → log warning, skip dedup, continue (fail-open)
- Supabase unavailable [P3] → `503`, do not fall back to Blobs silently
- Error format: `{ error: "human-readable message", code: "MACHINE_CODE" }`
- Log format: `[MODULE] [LEVEL] message` — never log raw email lists or API keys

---

## 13. CODE STYLE

- ES modules throughout — `.mjs` extension on all files
- `async/await` — no `.then()` chains
- Named exports from all `_lib/` modules
- Functions under ~50 lines — extract helpers freely
- One-line comment above every logical block
- Descriptive names — no abbreviations except `i`/`j` loop indices
- No `console.log` in production — `console.error` for failures, `console.info` for cron summaries

---

## 14. LOCAL DEVELOPMENT

```bash
npm install
npm install -g netlify-cli
cp .env.example .env

netlify dev    # Emulates Functions + Blobs locally

# Test subscribe
curl -X POST http://localhost:8888/.netlify/functions/subscribe \
  -H "Content-Type: application/json" -d '{"email":"test@example.com"}'

# Test daily digest
curl -X POST http://localhost:8888/.netlify/functions/send-newsletters \
  -H "x-cron-secret: your_secret"

# Test signal check [Phase 2+]
curl -X POST http://localhost:8888/.netlify/functions/check-signals \
  -H "x-cron-secret: your_secret"
```

---

## 15. API COST REFERENCE

| Source                  | Cost        | Key          | Rate limit           |
|-------------------------|-------------|--------------|----------------------|
| All RSS feeds (global)      | ✅ Free     | ❌ None      | Unlimited            |
| BTA / Novinite / BNB (BG)  | ✅ Free     | ❌ None      | Unlimited            |
| EU Commission / Parliament  | ✅ Free     | ❌ None      | Unlimited            |
| NATO / Defense News RSS     | ✅ Free     | ❌ None      | Unlimited            |
| SeeNews / Balkan Insight    | ✅ Free     | ❌ None      | Unlimited            |
| USASpending.gov         | ✅ Free     | ❌ None      | Generous             |
| SEC EDGAR               | ✅ Free     | ❌ None*     | 10 req/sec           |
| CoinGecko               | ✅ Free     | ❌ None      | 30 calls/min         |
| FRED (macro)            | ✅ Free     | ✅ Instant   | 120 req/min          |
| SAM.gov                 | ✅ Free     | ✅ 1–10 days | 1,000 req/day        |
| Finnhub (stocks)        | ✅ Free     | ✅ Instant   | 60 calls/min         |
| Netlify Blobs           | ✅ Free     | Built-in     | —                    |
| Upstash Redis [P2]      | ✅ Free     | ✅ Instant   | 10K req/day          |
| Supabase [P3]           | ✅ Free     | ✅ Instant   | 500MB / 2 projects   |
| Resend (email)          | 💰 Freemium | ✅ Yes       | 3,000 emails/month   |
| Bing Search             | 💰 Paid     | ✅ Yes       | Per plan             |
| OpenAI                  | 💰 Paid     | ✅ Yes       | Per plan             |

*EDGAR requires `User-Agent` header, not an API key.

**Only real costs: Bing + OpenAI + Resend above 3K/month.**
Everything else is free at this application's scale.

---

## 16. WHAT TO GENERATE WHEN ASKED

When the user says "generate the code" or "build phase N":

1. Confirm which phase
2. Full project file tree
3. `netlify.toml` for that phase
4. `.env.example` (all phases documented)
5. `package.json`
6. `index.html` — subscription landing page
7. All serverless functions for that phase
8. All `_lib/` modules relevant to that phase including `regional.mjs`
9. [Phase 3] `preferences.html`

Always:
- ES modules (`.mjs`)
- Signed unsubscribe link in every outbound email
- Source `<a href>` for every data item in newsletter
- Financial disclaimer on all market/crypto/watchlist sections
- `x-cron-secret` check on all cron endpoints
