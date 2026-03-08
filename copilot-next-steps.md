Intelligence Pipeline — Phase 4
Detailed Implementation Guide for VS Code Copilot
New Sources: GDELT · Press Releases · Twitter · Google News



How to Use This Document
📋  Each section is a standalone Copilot prompt. Open the target file in VS Code, paste the prompt into Copilot Chat, and let it generate the code. Then move to the next section.

Project Folder Structure
Your project must have this layout before starting:
your-project/
├── netlify/
│   └── functions/
│       └── _lib/
│           ├── gdelt.mjs          ← CREATE (Section 2)
│           ├── press.mjs          ← CREATE (Section 3)
│           └── twitter.mjs        ← CREATE (Section 4)
├── rss.mjs                        ← EDIT   (Section 5)
├── watchlist.mjs                  ← EDIT   (Section 6)
├── send-newsletters.mjs           ← EDIT   (Section 8)
└── ai.mjs                         ← EDIT   (Section 9)

Copilot Tips for Best Results
    • Always open the target file before pasting a prompt — Copilot uses the active file as context.
    • If Copilot generates incomplete code, follow up with: 'Continue from where you left off.'
    • After each file is generated, run: node --input-type=module < filename.mjs to test for syntax errors.
    • Use the exact function names defined in this guide — other files import them by name.

Section 1 — Architecture Overview
The system has four layers. Each layer depends on the previous one.

1. Ingestion Layer
Fetches raw data from external sources. One file per source. Returns normalized event objects. No filtering here.
2. Filtering Layer
Lives inside watchlist.mjs. Each source gets its own filter function. Applies category, keyword, tone, and severity filters.
3. Scoring Layer
Also in watchlist.mjs. Cross-source confirmation boosts score. Single-source events get lower priority.
4. Output Layer
send-newsletters.mjs and ai.mjs consume the scored signals. New newsletter sections are added for each source.

Normalized Event Object (shared contract between all layers)
⚠️  Every ingestion module MUST return events in exactly this shape. The filter and scoring layers depend on it.
{
  id:         String,   // unique hash (source + timestamp + title)
  source:     String,   // 'gdelt' | 'press' | 'twitter' | 'googlenews' | 'rss'
  title:      String,   // headline or event summary
  summary:    String,   // full description or tweet text
  url:        String,   // original article/tweet URL
  timestamp:  Date,     // JavaScript Date object (UTC)
  tone:       Number,   // GDELT tone score (0 for non-GDELT sources)
  category:   String,   // GDELT event code or inferred category
  score:      Number,   // severity score, computed in scoring layer (default 0)
  confirmed:  Boolean,  // true if same event seen in 2+ sources
}

Section 2 — gdelt.mjs (Ingestion)
File to create: netlify/functions/_lib/gdelt.mjs

What This File Does
    • Fetches GDELT's 15-minute event CSV from the public endpoint.
    • Parses the TSV rows into normalized event objects.
    • Returns ALL events unfiltered — filtering happens in watchlist.mjs.
    • Handles network errors gracefully and returns an empty array on failure.

GDELT CSV Columns You Need
📌  GDELT uses a tab-separated format with 61 columns. You only need these:
Column 0:  GLOBALEVENTID   — unique event ID
Column 1:  SQLDATE         — YYYYMMDD format
Column 26: EventCode       — CAMEO event category code
Column 30: NumMentions     — how many sources mentioned this
Column 34: AvgTone         — tone score (-100 to +100)
Column 57: SOURCEURL       — original article URL

Copilot Prompt — Paste into gdelt.mjs
💬  Create the file first (can be empty), open it in VS Code, then paste this prompt into Copilot Chat.
// Copilot: Generate the full contents of this file based on these instructions.
//
// FILE: netlify/functions/_lib/gdelt.mjs
// PURPOSE: Fetch and parse GDELT 15-minute event feed
//
// REQUIREMENTS:
// 1. Export one async function: fetchGDELT()
// 2. Fetch the latest GDELT 15-min CSV from:
//    http://data.gdeltproject.org/gdeltv2/lastupdate.txt
//    — This file contains 3 lines. The THIRD line has the export CSV URL.
//    — Parse that URL, then fetch the .zip it points to.
//    — Unzip it in memory (use the 'unzipper' npm package or Node built-ins).
// 3. Parse the unzipped TSV:
//    — Split by newline, then split each row by tab.
//    — Extract columns: 0 (id), 1 (date YYYYMMDD), 26 (eventCode),
//      30 (numMentions), 34 (avgTone), 57 (sourceUrl).
//    — Skip rows where sourceUrl is missing or not a valid http URL.
// 4. Convert each valid row to a normalized event object:
//    {
//      id:        `gdelt_${col[0]}`,
//      source:    'gdelt',
//      title:     `GDELT Event ${col[26]} — ${col[0]}`,
//      summary:   `EventCode: ${col[26]}, Mentions: ${col[30]}, Tone: ${col[34]}`,
//      url:       col[57],
//      timestamp: new Date(  // parse YYYYMMDD string to Date  ),
//      tone:      parseFloat(col[34]) || 0,
//      category:  col[26],
//      score:     0,
//      confirmed: false,
//    }
// 5. Return the array of normalized events.
// 6. Wrap everything in try/catch — on error, log the error and return [].
// 7. Use ES module syntax (import/export), no require().

Expected Export
// gdelt.mjs must export:
export async function fetchGDELT() { ... }
// Returns: Promise<NormalizedEvent[]>

Section 3 — press.mjs (Ingestion)
File to create: netlify/functions/_lib/press.mjs

What This File Does
    • Fetches RSS feeds from PRNewswire, BusinessWire, and GlobeNewswire.
    • Parses XML RSS items and normalizes them to the shared event object shape.
    • Runs all three feeds in parallel with Promise.all for performance.
    • Returns all items unfiltered — filtering happens in watchlist.mjs.

RSS Feed URLs
PRNewswire:    https://www.prnewswire.com/rss/news-releases-list.rss
BusinessWire:  https://feed.businesswire.com/rss/home/?rss=G1
GlobeNewswire: https://www.globenewswire.com/RssFeed/subjectcode/15-Financial

Copilot Prompt — Paste into press.mjs
💬  Create the file first, open it in VS Code, then paste this prompt.
// Copilot: Generate the full contents of this file.
//
// FILE: netlify/functions/_lib/press.mjs
// PURPOSE: Fetch press release RSS feeds from 3 major wire services
//
// REQUIREMENTS:
// 1. Export one async function: fetchPressReleases()
// 2. Fetch these RSS URLs in parallel (Promise.all):
//    - https://www.prnewswire.com/rss/news-releases-list.rss
//    - https://feed.businesswire.com/rss/home/?rss=G1
//    - https://www.globenewswire.com/RssFeed/subjectcode/15-Financial
// 3. Parse each RSS XML response:
//    — Use the built-in DOMParser if in browser, or a lightweight XML parser
//      like 'fast-xml-parser' or manual regex for Netlify Functions.
//    — Extract from each <item>: <title>, <description>, <link>, <pubDate>.
// 4. Normalize each item to this shape:
//    {
//      id:        `press_${hash(link)}`,  // simple hash: btoa(link).slice(0,16)
//      source:    'press',
//      title:     item.title,
//      summary:   item.description (strip HTML tags),
//      url:       item.link,
//      timestamp: new Date(item.pubDate),
//      tone:      0,
//      category:  'press_release',
//      score:     0,
//      confirmed: false,
//    }
// 5. Deduplicate by url before returning.
// 6. Return combined array from all 3 feeds.
// 7. If one feed fails, log the error and continue with the others.
// 8. Use ES module syntax (import/export), no require().

Expected Export
// press.mjs must export:
export async function fetchPressReleases() { ... }
// Returns: Promise<NormalizedEvent[]>

Section 4 — twitter.mjs (Ingestion — Optional)
⚠️  This module requires a paid Twitter API v2 Bearer Token. Skip this section if you don't have API access. The rest of the system works without it.
File to create: netlify/functions/_lib/twitter.mjs

What This File Does
    • Connects to the Twitter v2 filtered stream endpoint.
    • Tracks a predefined set of breaking news keywords.
    • Buffers incoming tweets and returns them as normalized events.
    • Falls back gracefully if API key is missing — returns empty array.

Environment Variable Required
TWITTER_BEARER_TOKEN=your_token_here   // set in Netlify environment variables

Tracked Keywords (Stream Rules)
breaking, explosion, earthquake, shooting, attack,
protest, strike, emergency, evacuation, outbreak,
cyberattack, sanctions, collapse, riot, flooding

Copilot Prompt — Paste into twitter.mjs
💬  Create the file first, open it in VS Code, then paste this prompt.
// Copilot: Generate the full contents of this file.
//
// FILE: netlify/functions/_lib/twitter.mjs
// PURPOSE: Fetch recent tweets matching breaking-news keywords via Twitter API v2
//
// REQUIREMENTS:
// 1. Export one async function: fetchTweets()
// 2. Read TWITTER_BEARER_TOKEN from process.env.
//    — If missing or empty, log a warning and return [].
// 3. Use the Twitter v2 recent search endpoint (NOT the stream):
//    GET https://api.twitter.com/2/tweets/search/recent
//    — This is simpler and works without stream setup.
//    — Query: '(breaking OR explosion OR earthquake OR shooting OR attack OR
//      protest OR strike OR emergency OR evacuation OR outbreak OR
//      cyberattack OR sanctions OR collapse OR riot OR flooding)
//      -is:retweet lang:en'
//    — Fields: tweet.fields=created_at,public_metrics,author_id
//    — max_results: 50
// 4. Normalize each tweet to this shape:
//    {
//      id:        `twitter_${tweet.id}`,
//      source:    'twitter',
//      title:     tweet.text.slice(0, 100),
//      summary:   tweet.text,
//      url:       `https://twitter.com/i/web/status/${tweet.id}`,
//      timestamp: new Date(tweet.created_at),
//      tone:      0,
//      category:  'tweet',
//      score:     tweet.public_metrics?.retweet_count || 0,
//      confirmed: false,
//    }
// 5. Return the normalized array.
// 6. Wrap in try/catch — on error, log and return [].
// 7. Use ES module syntax (import/export), no require().

Expected Export
// twitter.mjs must export:
export async function fetchTweets() { ... }
// Returns: Promise<NormalizedEvent[]>

Section 5 — rss.mjs (Edit Existing File)
This file already exists. You are adding Google News RSS endpoints to it.

Google News RSS Endpoints to Add
// Top headlines
https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en

// Breaking news / world
https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en

// Business
https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en

// Technology
https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en

Copilot Prompt — Paste into rss.mjs (with file open)
💬  Open rss.mjs first so Copilot sees the existing code structure.
// Copilot: Modify this existing file to add Google News RSS support.
//
// ADD a new exported async function: fetchGoogleNews()
//
// REQUIREMENTS:
// 1. Fetch these 4 Google News RSS feeds in parallel (Promise.all):
//    - https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en
//    - https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en
//    - https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en
//    - https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en
// 2. Use the same XML parsing pattern already used in this file.
// 3. Normalize each item to the same NormalizedEvent shape:
//    {
//      id:        `gnews_${btoa(link).slice(0,16)}`,
//      source:    'googlenews',
//      title:     item.title,
//      summary:   item.description || item.title,
//      url:       item.link,
//      timestamp: new Date(item.pubDate),
//      tone:      0,
//      category:  'news',
//      score:     0,
//      confirmed: false,
//    }
// 4. Deduplicate by url.
// 5. Return combined array.
// 6. If a feed fails, log and skip it.
// DO NOT change any existing functions in this file.

Section 6 — watchlist.mjs — Filter Functions (Edit Existing)
Add four new filter functions to your existing watchlist.mjs. Each function takes an array of normalized events and returns a filtered subset.

Filter 1: filterGDELT(events)
// Copilot: Add this function to watchlist.mjs
//
// FUNCTION: filterGDELT(events)
// INPUT:  Array of NormalizedEvent from fetchGDELT()
// OUTPUT: Filtered array — only high-signal events
//
// FILTER RULES (apply in this order, keep event only if it passes ALL):
//
// RULE 1 — Tone filter:
//   Keep only events where tone < -1
//   (negative tone = likely impactful event)
//
// RULE 2 — Category filter (CAMEO event codes):
//   Keep events whose category starts with any of these prefixes:
//   ['14','17','18','19','20'] — these map to:
//   14=Protest, 17=Coerce, 18=Assault, 19=Fight, 20=Use unconventional mass violence
//   Also keep if category is in: ['0211','0231','0311','1011','1031']
//
// RULE 3 — Keyword filter:
//   Keep event if title+summary contains any of these words (case-insensitive):
//   explosion, earthquake, shooting, attack, protest, strike, emergency,
//   evacuation, outbreak, cyberattack, sanctions, collapse, riot, fire,
//   flooding, bombing, assassination, coup, invasion, hostage
//
// RULE 4 — Severity scoring:
//   After filtering, compute a score for each kept event:
//   base score = 50
//   + (Math.abs(tone) * 2)           // more negative = higher score
//   + (numMentions * 0.5)             // more sources = higher score
//   + (category in high-priority list ? 20 : 0)
//   Set event.score = computed score
//
// Return the filtered + scored array.

Filter 2: filterPressReleases(events)
// Copilot: Add this function to watchlist.mjs
//
// FUNCTION: filterPressReleases(events)
// INPUT:  Array of NormalizedEvent from fetchPressReleases()
// OUTPUT: Filtered array — only financially/strategically relevant releases
//
// FILTER RULES — keep event if title OR summary contains any of:
//
// HIGH-VALUE KEYWORDS (score += 30):
//   acquisition, merger, acquires, bankruptcy, FDA approval, FDA clears,
//   SEC charges, class action, recall, settlement, indictment
//
// MEDIUM-VALUE KEYWORDS (score += 15):
//   earnings, quarterly results, revenue, guidance, forecast, partnership,
//   strategic alliance, joint venture, IPO, funding, raises $, series A/B/C
//
// LOWER-VALUE KEYWORDS (score += 5):
//   new product, launch, appoints, names CEO, names CFO, expands
//
// RULES:
// 1. Discard event if it matches NONE of the above keywords.
// 2. Compute score by summing all matching keyword scores.
// 3. Set event.score = computed score.
// 4. Return filtered + scored array.

Filter 3: filterTweets(events)
// Copilot: Add this function to watchlist.mjs
//
// FUNCTION: filterTweets(events)
// INPUT:  Array of NormalizedEvent from fetchTweets()
// OUTPUT: Filtered array — only high-signal breaking news tweets
//
// STEP 1 — Remove noise (discard if any of these match):
//   - summary contains: 'giveaway', 'follow me', 'click here', 'RT to win',
//     'discount', 'promo', 'subscribe', '#ad', '#sponsored'
//   - summary is shorter than 30 characters
//   - summary contains more than 5 hashtags
//
// STEP 2 — Score remaining tweets:
//   base score = 10
//   + (retweet_count > 1000 ? 40 : retweet_count > 100 ? 20 : 5)
//   + (keyword intensity: count matching breaking-news keywords * 10)
//   Breaking-news keywords: explosion, earthquake, shooting, attack, protest,
//   strike, emergency, evacuation, outbreak, cyberattack, sanctions, collapse,
//   riot, flooding, bombing, coup, invasion
//
// STEP 3 — Keep only tweets with score >= 20
//
// STEP 4 — Set event.score and return filtered array.

Filter 4: filterGoogleNews(events)
// Copilot: Add this function to watchlist.mjs
//
// FUNCTION: filterGoogleNews(events)
// INPUT:  Array of NormalizedEvent from fetchGoogleNews()
// OUTPUT: Filtered array — only breaking/high-impact headlines
//
// FILTER RULES — keep event if title contains any of:
//   'breaking', 'urgent', 'alert', 'update', 'developing',
//   'crash', 'death', 'killed', 'attack', 'fire', 'explosion',
//   'earthquake', 'flood', 'hurricane', 'strike', 'protest',
//   'arrest', 'indicted', 'banned', 'crisis', 'emergency',
//   'collapse', 'hack', 'breach', 'recall', 'shutdown'
//
// SCORING:
//   base score = 30
//   + (title contains 'breaking' or 'urgent' ? 20 : 0)
//   + (number of matching keywords * 5)
//
// Return filtered + scored array.

Section 7 — watchlist.mjs — Scoring & Deduplication
Add these two functions to watchlist.mjs after the filter functions.

Cross-Source Confirmation
// Copilot: Add this function to watchlist.mjs
//
// FUNCTION: crossSourceConfirm(allEvents)
// INPUT:  Single flat array of ALL events from all sources (already filtered+scored)
// OUTPUT: Same array with confirmed=true and score boosted for confirmed events
//
// ALGORITHM:
// 1. For each event, extract 3 'fingerprint words':
//    — Take the first 8 words of event.title
//    — Remove stopwords: the, a, an, is, are, was, were, in, on, at, to, of
//    — Take the first 3 remaining meaningful words
// 2. For each event A, check every other event B (different source):
//    — If 2+ fingerprint words of A appear in B.title (case-insensitive),
//      mark BOTH as confirmed=true
//    — Add score bonus: +50 for GDELT+RSS match, +40 for press+RSS,
//      +60 for tweet+GDELT, +30 for any other cross-source match
// 3. Return updated array.

Deduplication
// Copilot: Add this function to watchlist.mjs
//
// FUNCTION: deduplicateEvents(events)
// INPUT:  Flat array of all events
// OUTPUT: Deduplicated array
//
// RULES:
// 1. If two events have the same URL → keep the one with higher score.
// 2. If two events have the same id → keep the first occurrence.
// 3. If two events have title similarity > 80% (simple: shared words / total words)
//    AND are from different sources AND within 2 hours → keep highest score.
// 4. Return the cleaned array sorted by score descending.

Master Orchestrator Function
⭐  This is the main function that ties everything together. Add it to watchlist.mjs.
// Copilot: Add this function to watchlist.mjs
//
// FUNCTION: buildSignalList()
// This is the main orchestrator. It calls all sources, filters, scores,
// confirms, deduplicates, and returns the final ranked signal list.
//
// STEPS:
// 1. Import at top of file:
//    import { fetchGDELT } from './netlify/functions/_lib/gdelt.mjs'
//    import { fetchPressReleases } from './netlify/functions/_lib/press.mjs'
//    import { fetchTweets } from './netlify/functions/_lib/twitter.mjs'
//    import { fetchGoogleNews } from './rss.mjs'
//
// 2. Fetch all sources in parallel:
//    const [gdeltRaw, pressRaw, tweetRaw, gnewsRaw] = await Promise.allSettled([
//      fetchGDELT(), fetchPressReleases(), fetchTweets(), fetchGoogleNews()
//    ])
//    — Use .allSettled (not .all) so one failure doesn't stop the rest
//    — Extract .value from fulfilled, use [] for rejected
//
// 3. Filter each source:
//    const gdeltFiltered  = filterGDELT(gdeltRaw)
//    const pressFiltered  = filterPressReleases(pressRaw)
//    const tweetFiltered  = filterTweets(tweetRaw)
//    const gnewsFiltered  = filterGoogleNews(gnewsRaw)
//
// 4. Merge into one array:
//    const all = [...gdeltFiltered, ...pressFiltered, ...tweetFiltered, ...gnewsFiltered]
//
// 5. Cross-source confirm:
//    const confirmed = crossSourceConfirm(all)
//
// 6. Deduplicate and sort:
//    const final = deduplicateEvents(confirmed)
//
// 7. Return final (top signals first by score)
//
// Export: export async function buildSignalList() { ... }

Section 8 — send-newsletters.mjs (Edit Existing)
Add new newsletter sections for each intelligence source.

Copilot Prompt — Paste into send-newsletters.mjs (with file open)
💬  Open the file first so Copilot sees the existing structure and email format.
// Copilot: Modify this file to add new intelligence sections to the newsletter.
//
// IMPORT at the top:
//   import { buildSignalList } from './watchlist.mjs'
//
// CHANGES NEEDED:
//
// 1. Call buildSignalList() to get the ranked signal list.
//    const signals = await buildSignalList()
//
// 2. Split signals by source for separate sections:
//    const gdeltSignals  = signals.filter(e => e.source === 'gdelt').slice(0, 5)
//    const pressSignals  = signals.filter(e => e.source === 'press').slice(0, 5)
//    const tweetSignals  = signals.filter(e => e.source === 'twitter').slice(0, 5)
//    const gnewsSignals  = signals.filter(e => e.source === 'googlenews').slice(0, 5)
//    const topSignals    = signals.filter(e => e.confirmed).slice(0, 3)
//
// 3. Add these sections to the newsletter HTML (in this order):
//
//    SECTION A: 'Top Confirmed Signals' (confirmed=true, any source, top 3)
//    — Use a yellow highlight box to draw attention
//    — Show: title, sources that confirmed it, score, link
//
//    SECTION B: 'Global Early Signals (GDELT)'
//    — Show top 5 GDELT events
//    — For each: title, summary, tone score, link
//
//    SECTION C: 'Corporate Announcements'
//    — Show top 5 press releases
//    — For each: title, summary, link
//
//    SECTION D: 'Real-Time Signals'  (only if tweetSignals.length > 0)
//    — Show top 5 tweets
//    — For each: text preview, retweet count, link
//
//    SECTION E: 'Breaking Headlines (Google News)'
//    — Show top 5 headlines
//    — For each: title, link
//
// 4. If a section has 0 items, omit it from the email entirely.
// 5. Keep existing newsletter sections unchanged.

Section 9 — ai.mjs (Edit Existing)
Update the AI system prompt and message builder to incorporate the new signal data.

Copilot Prompt — Paste into ai.mjs (with file open)
💬  Open ai.mjs first so Copilot can match your existing prompt style.
// Copilot: Modify this file to include new intelligence signals in the AI prompt.
//
// CHANGES NEEDED:
//
// 1. Find the function that builds the user message / context for the AI.
//    (It likely builds a string with news items to summarize.)
//
// 2. Add a new parameter: signals (the output from buildSignalList())
//
// 3. Append this block to the context string passed to the AI:
//
//    --- EARLY INTELLIGENCE SIGNALS ---
//    The following signals were detected BEFORE mainstream media coverage.
//    Prioritize any item marked CONFIRMED (seen in 2+ sources).
//
//    [TOP CONFIRMED SIGNALS]
//    {topSignals.map(s => `- [CONFIRMED] ${s.title} (score: ${s.score}) ${s.url}`)}
//
//    [GLOBAL EVENTS - GDELT]
//    {gdeltSignals.map(s => `- ${s.title} | tone: ${s.tone} | ${s.url}`)}
//
//    [CORPORATE - PRESS RELEASES]
//    {pressSignals.map(s => `- ${s.title} | ${s.url}`)}
//
//    [REAL-TIME - TWITTER]
//    {tweetSignals.map(s => `- ${s.summary.slice(0,120)} | ${s.url}`)}
//
//    [BREAKING - GOOGLE NEWS]
//    {gnewsSignals.map(s => `- ${s.title} | ${s.url}`)}
//    --- END SIGNALS ---
//
// 4. Update the system prompt to include:
//    'You have access to early intelligence signals from GDELT, press releases,
//    Twitter, and Google News — often ahead of mainstream media.
//    Highlight any CONFIRMED cross-source signals prominently.
//    Use tone scores to gauge severity: below -3 indicates a serious event.'
//
// 5. Keep all existing AI logic unchanged.

Section 10 — Testing & Verification
Run these checks after building each module to verify everything works end-to-end.

Step-by-Step Test Sequence
Test gdelt.mjs
node --input-type=module -e "import { fetchGDELT } from './netlify/functions/_lib/gdelt.mjs'; fetchGDELT().then(r => console.log('GDELT events:', r.length))"
Expected output: GDELT events: [number > 0]

Test press.mjs
node --input-type=module -e "import { fetchPressReleases } from './netlify/functions/_lib/press.mjs'; fetchPressReleases().then(r => console.log('Press events:', r.length))"
Expected output: Press events: [number > 0]

Test rss.mjs (Google News)
node --input-type=module -e "import { fetchGoogleNews } from './rss.mjs'; fetchGoogleNews().then(r => console.log('GNews events:', r.length))"
Expected output: GNews events: [number > 0]

Test watchlist.mjs filters
node --input-type=module -e "import { buildSignalList } from './watchlist.mjs'; buildSignalList().then(r => { console.log('Total signals:', r.length); console.log('Confirmed:', r.filter(e=>e.confirmed).length); console.log('Top score:', r[0]?.score); })"
Expected: Total signals > 0, At least some confirmed events

Common Errors & Fixes
Error
Fix
Cannot find package 'unzipper'
Run: npm install unzipper in your project root
fetch is not defined
Add: import fetch from 'node-fetch' at top of file, or ensure Node 18+
TWITTER_BEARER_TOKEN not set
Add it to your .env file and Netlify environment variables
GDELT returns 0 events
The 15-min feed URL changes — re-check lastupdate.txt for the current URL
Promise.allSettled returns rejected
One source is down. Check console logs — the rest still work


Section 11 — Implementation Checklist
✅  Use this as your build order. Complete each item before moving to the next.

Phase 1 — New Ingestion Files
    • [ ] Create netlify/functions/_lib/gdelt.mjs using Section 2 prompt
    • [ ] Test: fetchGDELT() returns events array
    • [ ] Create netlify/functions/_lib/press.mjs using Section 3 prompt
    • [ ] Test: fetchPressReleases() returns events array
    • [ ] (Optional) Create netlify/functions/_lib/twitter.mjs using Section 4 prompt
    • [ ] Add TWITTER_BEARER_TOKEN to .env if using Twitter

Phase 2 — Edit Existing Files
    • [ ] Open rss.mjs and add fetchGoogleNews() using Section 5 prompt
    • [ ] Test: fetchGoogleNews() returns events array
    • [ ] Open watchlist.mjs and add filterGDELT() using Section 6
    • [ ] Open watchlist.mjs and add filterPressReleases() using Section 6
    • [ ] Open watchlist.mjs and add filterTweets() using Section 6
    • [ ] Open watchlist.mjs and add filterGoogleNews() using Section 6

Phase 3 — Scoring & Orchestration
    • [ ] Add crossSourceConfirm() to watchlist.mjs using Section 7
    • [ ] Add deduplicateEvents() to watchlist.mjs using Section 7
    • [ ] Add buildSignalList() to watchlist.mjs using Section 7
    • [ ] Test: buildSignalList() returns ranked, confirmed signals

Phase 4 — Output Layer
    • [ ] Update send-newsletters.mjs using Section 8 prompt
    • [ ] Update ai.mjs using Section 9 prompt
    • [ ] Run full end-to-end test from Section 10
    • [ ] Deploy to Netlify and verify functions execute
