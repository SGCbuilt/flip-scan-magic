# Auction Radar: Deep Scan memos + Chatham County email alerts

Two additions, both built on top of what already exists. No existing engine, verified API schema, or auth file is touched.

## 1. Investor memo per auction listing

Each auction card gets a "Deep Scan" button. Pressing it runs the same Deep Scan already used elsewhere in the app — property photos, permit history, distress signals, strategy variants and an AI written memo — for that specific address, and shows the result in an expandable panel under the card.

- A "Deep Scan all visible" button runs them in sequence (3 at a time) with live progress, so a whole result list can be worked through in one pass.
- Each memo is cached in the page for the session, and copied into the pipeline note when the card is sent to the pipeline, so the memo travels with the deal.
- Failed scans show the reason on the card instead of silently blanking.

Work: `src/components/AuctionRadar.tsx` only (frontend). It calls the existing `deep-scan` function, which is not modified.

## 2. Email alerts for new Chatham County auction listings

A watch that runs on a schedule, compares against what was already seen, and emails only genuinely new listings.

- New table `auction_watches` (area, state, county, window, email, active flag) and `auction_seen` (one row per address already reported) so the same property is never emailed twice.
- New scheduled function `auction-watch-run` runs the existing Auction Radar scan for each active watch (Chatham County, NC by default), diffs against the seen table, and sends a branded email listing only the new records with sale date, countdown, type, opening bid and source link. Nothing new to send means no email.
- Emails go through the project's existing verified sender on `notify.www.sgcbuilt.com`, using the standard app-email path (queued, retried, logged).
- Runs once a day at 7:00 AM ET. Auction notices are published daily at most, so anything faster would just add cost with no earlier warning; the trade-off is up to a 24-hour delay on a brand-new notice.
- In Auction Radar, a small "Email alerts" panel lets you turn the Chatham watch on/off, set the recipient address, and send a test email.

## Technical notes

- New files: `supabase/functions/auction-watch-run/index.ts`, an app-email template for the alert, one migration for the two tables (with RLS restricted to the owning user plus service-role access) and the daily cron entry.
- `supabase/functions/auction-radar/index.ts` is reused as-is by the watch runner (invoked, not edited).
- App email sending requires the project's transactional email scaffold; it will be added if not already present.
- Known caveat: the scan's paid sources are currently degraded (Firecrawl out of credits, RentCast returning 403). Alerts will fire correctly but will stay empty until at least one of those is restored.
