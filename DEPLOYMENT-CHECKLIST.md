# Phase 1 Deployment Checklist

## Pre-Deployment

### API Keys Obtained
- [ ] OpenAI API key (https://platform.openai.com/api-keys)
- [ ] Resend API key (https://resend.com/api-keys)
- [ ] Bing Search API key (Azure Portal - optional but recommended)
- [ ] FRED API key (https://fred.stlouisfed.org/docs/api/api_key.html)
- [ ] Finnhub API key (https://finnhub.io/register)
- [ ] SAM.gov API key (https://sam.gov/content/api) - may take 1-10 days

### Resend Email Setup
- [ ] Domain verified in Resend dashboard
- [ ] DNS records configured (SPF, DKIM)
- [ ] Sender email created (e.g., digest@yourdomain.com)
- [ ] Test email sent successfully

### Secrets Generated
- [ ] CRON_SECRET generated (32+ char random string)
- [ ] UNSUBSCRIBE_SECRET generated (32+ char random string)

### Local Testing Complete
- [ ] `npm install` successful
- [ ] `netlify dev` starts without errors
- [ ] Subscription endpoint works (POST /subscribe)
- [ ] Unsubscribe endpoint works (GET /unsubscribe?token=xxx)
- [ ] Manual digest trigger works (send-newsletters function)
- [ ] At least 1 data source returns data
- [ ] OpenAI generates valid HTML content
- [ ] Email sends successfully to test address

## Deployment

### Netlify Setup
- [ ] Netlify account created
- [ ] `netlify login` successful
- [ ] `netlify init` completed (site created/linked)
- [ ] Custom domain configured (optional but recommended)

### Environment Variables Set
**Required:**
- [ ] OPENAI_API_KEY
- [ ] OPENAI_MODEL (set to "gpt-4o" or "gpt-4o-mini")
- [ ] EMAIL_API_KEY (Resend)
- [ ] EMAIL_FROM (verified sender email)
- [ ] CRON_SECRET
- [ ] UNSUBSCRIBE_SECRET
- [ ] EDGAR_USER_AGENT (format: "AppName admin@yourdomain.com")

**Recommended:**
- [ ] BING_SEARCH_API_KEY (or skip Bing news)
- [ ] FRED_API_KEY
- [ ] FINNHUB_API_KEY
- [ ] SAM_GOV_API_KEY (if approved)

**Configuration:**
- [ ] WATCHED_COMPANIES
- [ ] WATCHED_STOCKS
- [ ] WATCHED_CRYPTOS
- [ ] WATCHED_REGIONS
- [ ] MAX_SUBSCRIBERS (default: 500)

### Deploy to Production
- [ ] `netlify deploy --prod` successful
- [ ] Build logs show no errors
- [ ] Function endpoints accessible:
  - [ ] `https://your-site.netlify.app/`
  - [ ] `https://your-site.netlify.app/.netlify/functions/subscribe`
  - [ ] `https://your-site.netlify.app/.netlify/functions/unsubscribe`
  - [ ] `https://your-site.netlify.app/.netlify/functions/send-newsletters`

## Post-Deployment Validation

### Frontend Validation
- [ ] Landing page loads correctly
- [ ] Form accepts valid email
- [ ] Form rejects invalid email
- [ ] Success message appears after subscription
- [ ] "Already subscribed" error works for duplicate
- [ ] Mobile responsive design works

### Function Validation
- [ ] Subscribe function creates subscriber in Netlify Blobs
- [ ] Subscriber count increments correctly
- [ ] Unsubscribe link works (click from email)
- [ ] Subscriber count decrements after unsubscribe

### Digest Validation
- [ ] Manual trigger sends digest successfully:
  ```bash
  curl -X POST https://your-site.netlify.app/.netlify/functions/send-newsletters \
    -H "x-cron-secret: YOUR_SECRET"
  ```
- [ ] Email arrives in inbox (not spam)
- [ ] Email content is well-formatted HTML
- [ ] All sections render correctly
- [ ] Source links work
- [ ] Unsubscribe link works from email
- [ ] Plain text version is readable

### Scheduled Function Validation
- [ ] Cron schedule visible in Netlify dashboard (Functions → send-newsletters → Settings)
- [ ] Schedule shows: "0 7 * * *" (daily at 07:00 UTC)
- [ ] Wait 24 hours or check logs after 07:00 UTC next day
- [ ] Confirm email sent automatically

## Monitoring Setup

### Netlify Dashboard
- [ ] Bookmark Functions → send-newsletters → Logs
- [ ] Bookmark Blobs page (to view subscriber data)
- [ ] Set up Netlify deploy notifications (optional)

### Resend Dashboard
- [ ] Check email delivery stats
- [ ] Monitor bounce rate
- [ ] Watch for spam complaints
- [ ] Check daily/monthly quota usage

### OpenAI Dashboard
- [ ] Monitor API usage
- [ ] Check daily costs
- [ ] Set up usage alerts (optional)

## Cost Monitoring

### First Week
- [ ] Check OpenAI usage (expected: ~$0.35 for 7 digests)
- [ ] Check Resend email count (should be: subscribers × 7)
- [ ] Verify Bing Search quota if used
- [ ] Check Netlify function invocations

### First Month
- [ ] Review total OpenAI cost (expected: ~$1.50 for 30 digests with 100 subs)
- [ ] Verify Resend stays under 3,000 emails/month (or upgrade)
- [ ] Check all API quotas are within free tiers

## Subscriber Growth

### At 10 Subscribers
- [ ] Confirm digest quality is good
- [ ] Collect early feedback
- [ ] Verify all sections have data

### At 50 Subscribers
- [ ] Monitor email delivery rate
- [ ] Check for spam folder issues
- [ ] Optimize OpenAI prompt if needed

### At 100 Subscribers
- [ ] 3,000 emails/month = 30 days = 100 subscribers max on Resend free tier
- [ ] Consider upgrading Resend ($20/mo for 50K emails)
- [ ] Monitor function execution time
- [ ] Review data source quality

### At 500 Subscribers (MAX_SUBSCRIBERS)
- [ ] Resend Pro required ($20/mo minimum)
- [ ] Expected monthly cost: ~$25-35 (Resend + OpenAI + Bing)
- [ ] Consider Phase 2 implementation (breaking alerts)

## Security Checks

- [ ] CRON_SECRET is strong and not exposed
- [ ] UNSUBSCRIBE_SECRET is strong and not exposed
- [ ] API keys are not in git repository
- [ ] `.env` is in `.gitignore`
- [ ] No secrets visible in function logs
- [ ] Unsubscribe tokens cannot be forged

## Backup & Recovery

- [ ] Netlify Blobs data is backed up automatically
- [ ] Environment variables documented in password manager
- [ ] Deployment can be recreated from git repository
- [ ] API keys are recoverable from provider dashboards

## Documentation

- [ ] README.md is accurate
- [ ] SETUP.md has complete instructions
- [ ] copilot-instructions.md preserved for Phase 2/3
- [ ] Git repository created (if applicable)
- [ ] First commit pushed with all Phase 1 code

## Ready for Production

- [ ] All critical items checked above
- [ ] At least 3 test subscribers confirmed working
- [ ] First automated digest sent successfully
- [ ] No errors in function logs for 48 hours
- [ ] Monitoring systems in place

## Phase 2 Preparation (Future)

When ready to add breaking alerts:
- [ ] Upstash Redis account created
- [ ] Redis environment variables documented
- [ ] Phase 2 budget approved (~$5/mo additional)
- [ ] Review copilot-instructions.md Phase 2 section

---

**Project Status:** ✅ Phase 1 Complete

**Next Action:** Set up API keys and deploy to Netlify

**Estimated Time to Production:** 2-4 hours (depending on API key approval times)
