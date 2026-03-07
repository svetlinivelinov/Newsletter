# Phase 1 Setup Guide

## Prerequisites

1. **Node.js 20+** installed
2. **Netlify CLI** installed globally: `npm install -g netlify-cli`
3. **API Keys** from:
   - OpenAI (https://platform.openai.com/api-keys)
   - Resend (https://resend.com/api-keys)
   - Bing Search API (Azure Portal - Cognitive Services)
   - FRED API (https://fred.stlouisfed.org/docs/api/api_key.html) - Free, instant
   - Finnhub (https://finnhub.io/register) - Free tier
   - SAM.gov (https://sam.gov/content/api) - Free, 1-10 day approval

## Local Development Setup

### Step 1: Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your API keys
# Required for Phase 1:
# - OPENAI_API_KEY
# - EMAIL_API_KEY (Resend)
# - BING_SEARCH_API_KEY
# - FRED_API_KEY
# - FINNHUB_API_KEY
# - CRON_SECRET (generate a random string)
# - UNSUBSCRIBE_SECRET (generate another random string)
# - EMAIL_FROM (your verified Resend sender email)
```

### Step 2: Generate Secrets

```bash
# Generate random secrets (PowerShell)
$bytes = New-Object byte[] 32
(New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Run this twice to generate CRON_SECRET and UNSUBSCRIBE_SECRET.

### Step 3: Start Local Development Server

```bash
netlify dev
```

This will start the local Netlify Functions environment at `http://localhost:8888`.

### Step 4: Test Locally

**Test subscription:**
```bash
curl -X POST http://localhost:8888/.netlify/functions/subscribe `
  -H "Content-Type: application/json" `
  -d '{"email":"test@example.com"}'
```

**Test digest (manual trigger):**
```bash
curl -X POST http://localhost:8888/.netlify/functions/send-newsletters `
  -H "x-cron-secret: YOUR_CRON_SECRET_FROM_ENV"
```

## Deployment to Netlify

### Step 1: Link to Netlify

```bash
# Login to Netlify
netlify login

# Initialize the site
netlify init
```

Follow the prompts to create a new site or link to an existing one.

### Step 2: Set Environment Variables

Go to your Netlify dashboard → Site settings → Environment variables and add all the required variables from `.env.example`.

Or set them via CLI:

```bash
netlify env:set OPENAI_API_KEY "sk-proj-xxxx"
netlify env:set EMAIL_API_KEY "re_xxxx"
netlify env:set BING_SEARCH_API_KEY "your-key"
netlify env:set FRED_API_KEY "your-key"
netlify env:set FINNHUB_API_KEY "your-key"
netlify env:set SAM_GOV_API_KEY "your-key"
netlify env:set CRON_SECRET "your-generated-secret"
netlify env:set UNSUBSCRIBE_SECRET "your-generated-secret"
netlify env:set EMAIL_FROM "digest@yourdomain.com"
netlify env:set EDGAR_USER_AGENT "YourAppName admin@yourdomain.com"
netlify env:set WATCHED_COMPANIES "Palantir,Anduril,Microsoft,Lockheed Martin,Scale AI"
netlify env:set WATCHED_STOCKS "PLTR,MSFT,LMT"
netlify env:set WATCHED_CRYPTOS "bitcoin,ethereum,solana"
netlify env:set WATCHED_REGIONS "BG,EU,NATO"
netlify env:set MAX_SUBSCRIBERS "500"
```

### Step 3: Verify Resend Domain

1. Go to https://resend.com/domains
2. Add your domain
3. Add the required DNS records (SPF, DKIM)
4. Verify the domain
5. Use an email like `digest@yourdomain.com` as EMAIL_FROM

### Step 4: Deploy

```bash
netlify deploy --prod
```

### Step 5: Verify Scheduled Function

The cron job is configured in `netlify.toml` to run at 07:00 UTC daily. 

To manually trigger it for testing:

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/send-newsletters \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

## Monitoring

### View Function Logs

```bash
netlify functions:list
netlify functions:invoke send-newsletters
```

Or check logs in Netlify dashboard → Functions → send-newsletters → Logs

### Check Subscriber Count

Subscriber data is stored in Netlify Blobs. You can view it in:
Netlify dashboard → Site → Blobs

## Cost Estimates

**Free tier limits:**
- Netlify Functions: 125K requests/month, 100 hours runtime
- Netlify Blobs: 1GB storage
- Resend: 3,000 emails/month (then $20/mo for 50K)
- OpenAI: Pay-per-use (~$0.01-0.05 per digest with GPT-4o)
- All data APIs: Free (except Bing Search)

**Expected monthly costs for 100 subscribers:**
- OpenAI: ~$1.50 (30 digests × $0.05)
- Resend: $0 (under 3K limit)
- Bing Search: ~$5-10 (depends on plan)
- **Total: ~$7-12/month**

## Troubleshooting

### "No data to send" in logs
- Check that API keys are set correctly
- Verify API rate limits haven't been exceeded
- Check individual source logs for errors

### Subscribers not receiving emails
- Verify Resend domain is verified
- Check EMAIL_FROM matches verified domain
- Check Resend dashboard for bounces/complaints
- Verify UNSUBSCRIBE_SECRET is set

### Function timeout
- Netlify scheduled functions have 15min timeout (should be plenty)
- If timing out, check which data source is slow
- Consider reducing WATCHED_* lists to speed up

### EDGAR rate limit errors
- EDGAR allows 10 req/sec
- Code already has 150ms delay between requests
- If still hitting limit, increase DELAY_MS in edgar.mjs

## Next Steps (Phase 2 & 3)

Phase 1 is now complete! When ready:

**Phase 2** adds:
- Breaking alert system (TIER 1 signals)
- Signal check every 30 minutes
- Upstash Redis for deduplication
- Rate limiting

**Phase 3** adds:
- Midday signal bundle
- Subscriber preferences (choose alert tiers)
- Supabase database
- Send history tracking
- Web dashboard

Follow the spec in `copilot-instructions.md` to implement these phases.
