# Supabase Setup for FlipScan Pro in Lovable

## Step 1 — Connect Supabase in Lovable

1. Open your project at **lovable.dev**
2. Click **Settings** (top right gear icon)
3. Go to **Integrations** → **Supabase**
4. Click **Connect Supabase**
5. Sign in with your Supabase account
6. Select your existing project or create a new one
7. Lovable automatically adds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your environment

## Step 2 — Deploy the Edge Function

The edge function proxies Census, FBI, and BLS government APIs (which block browser CORS).

### Option A — Supabase CLI (recommended)
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy market-proxy
```

### Option B — Supabase Dashboard
1. Go to **supabase.com** → your project → **Edge Functions**
2. Click **New Function** → name it `market-proxy`
3. Paste the contents of `supabase/functions/market-proxy/index.ts`
4. Click **Deploy**

## Step 3 — Set Edge Function Secrets

In Supabase Dashboard → **Edge Functions** → **Secrets**:

| Secret Name     | Value                          | Get it from                              |
|-----------------|--------------------------------|------------------------------------------|
| `CENSUS_API_KEY` | Your Census API key           | api.census.gov/data/key_signup.html      |
| `FBI_API_KEY`    | Your FBI UCR API key          | api.usa.gov/crime/fbi/api                |

Both keys are **free**. BLS (unemployment data) requires no key.

## Step 4 — API Keys in the App

All other API keys are stored in your browser localStorage via the app's Configure panels:

| Key | Where to set it | Get it from |
|-----|-----------------|-------------|
| Tracerfy (skip trace) | Lead Radar → Skip Tracing → Setup | tracerfy.com |
| Anthropic (AI scores) | Lead Radar → API Settings | console.anthropic.com |

## What Each Service Does

- **Supabase Edge Function** — proxies Census/FBI/BLS APIs for Area Intelligence tab
- **RentCast** — already configured, powers comps and AVM everywhere
- **Tracerfy** — skip tracing (owner name, phone, email, equity)
- **Anthropic Claude** — AI Motivation Scores on every lead

## Troubleshooting

**Area Intelligence shows no data** → Edge function not deployed or secrets not set

**Skip trace returns no results** → Check Tracerfy API key in Lead Radar settings

**AI scores not working** → Check Anthropic API key in Lead Radar settings

**Government API 401 errors** → Set CENSUS_API_KEY and FBI_API_KEY in Edge Function secrets

---

## Daily Digest Email Setup

### What it does
Every morning at 6:00 AM ET, a Supabase Edge Function:
1. Scans Norfolk, Virginia Beach, and Charlotte APIs for new leads filed in the last 24 hours
2. Filters to score 70+ only
3. Emails a formatted morning brief to **projects@sgcbuilt.com**

### Step 1 — Get a free Resend API key
1. Go to **resend.com** → Sign up (free)
2. Verify your domain or use their sandbox
3. Create an API key
4. Add to Supabase: Dashboard → Edge Functions → Secrets → `RESEND_API_KEY`

### Step 2 — Deploy the edge function
```bash
supabase functions deploy daily-digest
```

### Step 3 — Set secrets in Supabase Dashboard
Go to **Edge Functions → Secrets** and add:

| Secret            | Value                        |
|-------------------|------------------------------|
| `RESEND_API_KEY`  | Your Resend API key          |
| `DIGEST_TO_EMAIL` | projects@sgcbuilt.com        |
| `DIGEST_FROM`     | FlipScan Pro <noreply@yourdomain.com> |

### Step 4 — Schedule with pg_cron
In **Supabase SQL Editor**, run the contents of:
`supabase/migrations/20240101_schedule_digest.sql`

This schedules the digest at 11:00 AM UTC = 6:00 AM ET daily.

### Step 5 — Test manually
In FlipScan Pro → Morning Brief tab → click **✉ Send Email Now**

The email arrives in ~15 seconds. Check spam if not in inbox.

### Email includes
- 📊 Quick stats: new leads, critical count, tasks due, overdue count
- 🔥 Overdue task alert (red banner if any)
- 📅 Tasks due today count
- 📡 All new leads (score 70+) from last 24 hours with address, signal, severity
- ☀️ Direct link to open FlipScan Pro
