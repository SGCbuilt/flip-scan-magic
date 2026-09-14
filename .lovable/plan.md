# Closed-loop research + outreach agent

Turn the existing scan tools and Drip Sequences into one agent: research runs on a schedule and files new leads into Pipeline with a follow-up cadence already running; email touches write and send themselves. Calls, texts, voicemails and mail stay exactly as they are today — you tap to execute.

## One thing I need to flag first

Pipeline and Drip Sequences live in the browser (`src/lib/pipeline.ts`, `src/lib/drip.ts`), with a cloud mirror in the `flipscan_store` table (one JSON blob per user, per key). A scheduled server job cannot call `addToPipeline()` / `createDripSequence()` / `completeTouch()` directly — those only exist in the browser.

The fix that avoids duplicating anything: the scheduled jobs read and write the **same** `flipscan_store` rows (`flipscan_pipeline_v2`, `flipscan_drip_v1`), producing records in exactly the shape the existing libs use. A small shared Deno module mirrors the three functions above so the logic stays in one place per side.

Second consequence: today the browser only pulls from the cloud when local storage is empty, so agent-created leads would not appear until a clear. I will add a merge-on-load for those two keys only (cloud rows the browser has never seen get merged in; your local edits always win on conflict). No other sync behavior changes.

Also: Drive For Dollars and Market Analyzer have no area-scan endpoint of their own — D4D enriches one address at a time via `deep-scan` / `property-photos`. So the agent runs `auction-radar` + `chatham-permits` for discovery, then uses `deep-scan` to enrich each genuinely new hit. Same tools, no new ones.

## Part 1 — `research-agent-run`

Built on the same pattern as `auction-watch-run`: daily cron, on-demand from the UI, service-role or user JWT, diff against a seen table.

- For each active watch area: invoke `auction-radar`, and `chatham-permits` where the area matches, in one run.
- Dedupe against a new `research_agent_seen` table (`watch_id`, `addr_key`, same normalizer as `auction_seen`).
- New hits at or above the existing grade threshold (the grade `auction-radar` already assigns — no new scoring) get enriched by `deep-scan` and written into the user's Pipeline blob, same record shape `addToPipeline` writes.
- Each auto-added lead immediately gets a `motivated_seller` drip sequence, built from the same template definition `NewSequenceModal` uses.
- A daily summary email goes out through `send-transactional-email` using the `auction-alert` template pattern: what was found, what was auto-added, what got a sequence started.

## Part 2 — `drip-email-run`

- Daily: scan every user's drip blob for touches with `type === 'email'`, `status === 'pending'`, `scheduledDate <= today`.
- For each, ask the Lovable AI gateway (`google/gemini-2.5-flash`, low temperature) for a short, plain, non-salesy subject and body that references that lead's actual signal — auction date, permit activity, tax status, equity estimate — read off the pipeline record. Not the canned template text.
- New `seller-outreach` template in the registry: the same branded shell as the other emails, wrapping AI-written subject and body. Sent through `send-transactional-email`, so the existing suppression check, unsubscribe token/footer, queueing and retry all apply unchanged.
- On a successful send the touch is marked completed with outcome `Auto-sent — AI email`, and the generated text is stored on the touch so you can read exactly what went out in the sequence timeline.
- Call, SMS, voicemail and mail touches are skipped by an explicit type check — this function never touches them.

## Technical notes

- New tables: `research_agent_seen` (+ GRANTs, RLS, service-role access). `auction_watches` is reused as the area list.
- New shared module `supabase/functions/_shared/flipscan-store.ts`: read/write a user's `flipscan_store` key, plus server mirrors of `addToPipeline`, `createDripSequence`, `completeTouch` against those blobs.
- Two cron entries alongside the existing `auction-watch-daily` / `property-follow-daily`, staggered after them.
- Scraping stays free-fetch-first and cache-first — the agent calls `auction-radar`, which already enforces that; no new paid path and no new service.
- Untouched: `DealHunter.tsx` and its fusion logic; every protected engine in AGENTS.md; all non-email touch handling in `DripSequences.tsx`.
- UI: a small "Agent" strip on Drip Sequences showing last run, auto-added count and emails sent, with a "Run now" button reusing the same functions.
