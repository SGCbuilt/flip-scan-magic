# FlipScan Pro — API Setup Guide

## How to connect paid lead providers

### The architecture

```
Browser ──POST──► /api/proxy ──► ATTOM / BatchLeads / PropStream API
                  (Vercel/Netlify serverless)
                  ↑ API keys live here, never in browser
```

---

## Step 1 — Deploy to Vercel (5 minutes)

1. Push this folder to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Click Deploy (Vite is auto-detected)

---

## Step 2 — Add your API keys to Vercel

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

Add these (only add the ones you have subscriptions for):

| Variable Name        | Where to get it                    |
|----------------------|------------------------------------|
| `ATTOM_API_KEY`      | developers.attomdata.com → API Keys |
| `BATCHLEADS_API_KEY` | app.batchleads.io → Settings → API  |
| `PROPSTREAM_API_KEY` | app.propstream.com → API Settings   |
| `RESIMPLI_API_KEY`   | app.resimpli.com → API → Keys       |
| `DEALMACHINE_API_KEY`| app.dealmachine.com → Settings      |
| `CUSTOM_API_KEY`     | Any other provider                  |

After adding keys: **Vercel Dashboard → Deployments → Redeploy**

---

## Step 3 — Use Deal Hunter in FlipScan

1. Open FlipScan → **Deal Hunter** tab
2. Click **"+ Connect API"** next to any provider
3. Enter your API key (and optionally a custom endpoint)
4. Click **"Fetch Leads"**

That's it. Your leads appear with full address, owner contact info, equity, and distress score.

---

## Netlify alternative

Same process — add env variables at:
**Netlify Dashboard → Site → Environment variables**

The proxy function is at `netlify/functions/proxy.js` and auto-detected.

---

## ATTOM API — recommended endpoints for flippers

```
Distressed/pre-foreclosure:
  POST /api/proxy
  { "provider": "attom", "endpoint": "/sale/snapshot", "params": { "state": "VA" } }

Property search with equity filter:
  POST /api/proxy
  { "provider": "attom", "endpoint": "/property/snapshot", "params": { "city": "Norfolk", "state": "VA", "minEquity": 30 } }

Foreclosure auctions:
  POST /api/proxy
  { "provider": "attom", "endpoint": "/property/foreclosureauction", "params": { "state": "VA", "recordType": "P" } }
```

---

## BatchLeads API — recommended endpoints

```
Motivated sellers (absentee + high equity):
  POST /api/proxy
  { "provider": "batchleads", "endpoint": "/properties", "params": { "city": "Norfolk", "state": "VA", "absenteeOwner": "true", "minEquityPercent": 30 } }

Pre-foreclosure:
  POST /api/proxy
  { "provider": "batchleads", "endpoint": "/properties", "params": { "state": "VA", "preForeclosure": "true" } }

Tax delinquent:
  POST /api/proxy
  { "provider": "batchleads", "endpoint": "/properties", "params": { "state": "VA", "taxDelinquent": "true" } }
```

---

## Free trials to start with

| Provider   | Trial                      | Link                          |
|------------|----------------------------|-------------------------------|
| ATTOM Data | 30-day sandbox free        | api.developer.attomdata.com   |
| BatchLeads | Free trial available       | batchleads.io                 |
| PropStream | 7 days + 50 free leads     | propstream.com                |
| REsimpli   | 30 days full access        | resimpli.com                  |
| DealMachine| 7 days                     | dealmachine.com               |
