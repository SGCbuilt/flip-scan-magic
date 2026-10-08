# SGC Auction Database — be the source, no paid services

## Goal
Build our own nationwide database of foreclosure, pre-foreclosure, bank-owned and tax sale properties. We collect the data ourselves from free public records, store it, and keep it up to date every day. Auction Radar searches our database first, so results are instant and need no paid services.

## How it works
```text
Free public sources ──► daily collectors ──► SGC Auction Database ──► Auction Radar / Research Agent / Pipeline
 (county, sheriff,        (run on a schedule,    (one record per property,
  trustee, notices,        read pages directly,   with sale date, history,
  HUD/Fannie/Freddie)      no credits)            source proof)
```

## What gets built
1. **Source list:** a list of public websites we collect from, with state, county, auction type and how to read each one. It starts with sources that work everywhere, and you can add new counties from a screen in the app.
   - HUD homes, Fannie Mae HomePath and Freddie Mac HomeSteps (bank-owned, nationwide)
   - County sheriff sale sites on common platforms (CivilView, RealForeclose / RealTaxDeed, GovEase, LienHub, Bid4Assets county pages)
   - Statewide public-notice websites (newspaper legal notices for trustee sales, notices of default and tax sales)
   - Trustee law firm sale lists already trusted in VA, NC, TN and FL
2. **Daily collectors:** each morning a scheduled job visits every enabled source with plain page reads (free) and pulls out the address, sale date, opening bid, case number, auction type and a link back to the source. It uses the existing engine already included in the app, and no record is saved without a date and an address or case number.
3. **The database:** one record per property, matched by address, with:
   - its status over time (pre-foreclosure, then scheduled, postponed, sold, cancelled)
   - date first seen and date last confirmed
   - every source that listed it, kept as proof
   Records that disappear from their source are marked "no longer listed" instead of being deleted.
4. **Auction Radar searches our data first:** results for any state, county or city come back instantly from our database. Scoring, Deep Scan and saving to the Pipeline work as they do now. The old live web search becomes an optional "search the web too" button.
5. **Your own captures count:** properties saved from Drive for Dollars and Chatham Permits are added to the database as owned leads.
6. **Coverage screen:** shows which states and counties are covered, how many live records each has, when each source last worked, and any broken sources.

## Honest limits
- No free source covers every county. We start with sources that cover all states (bank-owned homes and the shared sale platforms) plus your four core states in depth, then add counties over time.
- Some county sites block automated reading or need a login. Those are marked "manual" instead of being worked around.
- Paid services stay switched off. The existing hooks are kept but are not needed.

## Technical details
- New tables (RLS on; anyone signed in can read, only the system can write): `auction_sources`, `auction_records` (address key unique, status, sale_date, opening_bid, type, county, state, lat/lng nullable), `auction_record_events` (status history), `auction_source_runs` (health log).
- New edge function `auction-collect`: cron runs it daily at 6:00 AM ET with the existing cron secret. Each source gets a parser type (`json_api`, `html_table`, `notice_text`), with free fetch only and Firecrawl never called. Notice text goes through the existing gateway extraction at temperature 0, and the same validation rules as auction-radar apply.
- `auction-radar` gains a "db" mode that queries `auction_records` first. The existing live path stays unchanged as a fallback.
- Protected engine files are not modified. New code imports from them only.
