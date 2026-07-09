# Fix owner name + redesign AI evaluation

Two problems to solve on the Drive-for-Dollars result screen:

1. Ownership & Contacts card always shows "Not verified" because RentCast `/properties` alone is returning nothing usable for most addresses.
2. The new AI Investor Evaluation renders as a stack of heavy colored blocks instead of a professional layout.

Both fixes are UI + data-layer only. No changes to protected engines (`dealGrade.ts`, `rehabEstimator.ts`, `dataFusion.ts`, `leadRadar.ts`, `rentcast.ts` client, etc.).

---

## 1. Owner name — layered lookup with source badge

Update `src/lib/ownerLookup.ts` and `src/components/DriveForDollars.tsx` only. The RentCast edge function stays as-is (its endpoint whitelist already exposes what we need).

New lookup ladder (each step runs only if the previous returned no name):

1. **RentCast `/properties`** — current call, kept as-is.
2. **RentCast `/avm/value`** — RentCast's AVM response also carries `owner` + `ownerOccupied`; often populated when `/properties` is thin.
3. **RentCast `/listings/sale`** — for recently-listed addresses this returns owner-of-record on the listing.
4. **County assessor / Register-of-Deeds via Firecrawl search** — targeted query:
   `"{street address}" {city} {state} (owner OR "owner of record") (site:assessor OR site:registerofdeeds OR site:tax OR site:gis)`
   Extract the first snippet that contains a plausible name (heuristic: two capitalized tokens near "owner", exclude realty/LLC-suffix filter still allowed).
5. Return `EMPTY` only after all four miss.

Client changes in `DriveForDollars.tsx`:
- Always run `lookupOwner` when skip-trace returns no name (already partially wired — will be tightened so a `hit: true` result with blank `owner.name` also triggers the fallback).
- Pass the returned `source` through to the Owner strip so the card displays a small badge: "RentCast", "RentCast AVM", "Listing record", or "County assessor (verify)".
- When the source is Firecrawl-based, add an amber "Verify in county records" hint under the name so it isn't treated as authoritative.

## 2. AI Investor Evaluation — professional research-memo layout

Rewrite only the rendering block in `DriveForDollars.tsx` (the `dsData?.evaluation` card). Edge function and JSON schema stay as-is — GPT-5.5 already returns priority-tagged sections.

New layout:

```text
┌────────────────────────────────────────────────────────────┐
│ AI INVESTOR EVALUATION      GPT-5.5 · REVIEW-ONLY         │  navy header bar
├────────────────────────────────────────────────────────────┤
│  BOTTOM LINE                                               │  hero paragraph
│  Single-sentence verdict, 14px semibold navy on white.     │
├────────────────────────────────────────────────────────────┤
│ ▍ CRITICAL   Red Flags        │ ▍ HIGH   Deal Thesis       │  2-col grid
│   paragraph body, 12px …      │   paragraph body …         │  (stacks < md)
├────────────────────────────────┼────────────────────────────┤
│ ▍ HIGH   Recommended Play     │ ▍ MEDIUM Rehab & Scope     │
├────────────────────────────────┼────────────────────────────┤
│ ▍ MEDIUM Seller Approach      │ ▍ LOW   Data Confidence    │
└────────────────────────────────────────────────────────────┘
```

Design rules:
- White card background, single 1px `var(--sgc-gray-border)` outline, no shadow on children.
- Priority shown as a 3px left rail + a small uppercase pill (mono font) at the top of each section — no heavy colored panel backgrounds.
- Palette: `critical #C0341D`, `high #C45E1A`, `medium #8A5700`, `low #1B3A8C`, `info #8B8F9A`. Only used on the rail and the pill; body text stays `var(--sgc-black)`.
- Sections rendered in a fixed priority order (critical → high → medium → low → info), not the order the model returned them, so the eye lands on risk first.
- Uses existing brand tokens only (`var(--sgc-navy)`, `var(--sgc-navy-pale)`, `var(--sgc-gray-border)`, `var(--sgc-black)`). No new colors added, no new fonts.
- Fully responsive: single column below `md`, two columns from `md` up.
- Empty-state (no `evaluation.sections` yet, only legacy `summary` string) falls back to a single card rendering the plain summary text — no broken UI during transition.

---

## Files touched

- `src/lib/ownerLookup.ts` — add AVM + Listings + Firecrawl fallback steps; expose `source` label.
- `src/components/DriveForDollars.tsx`:
  - Tighten the `lookupOwner` trigger to fire on blank name even when `trace.hit === true`.
  - Add source badge + "verify in county records" hint to the Owner strip.
  - Replace the current AI evaluation render block with the new research-memo layout described above.

## Explicitly NOT touched

- `supabase/functions/rentcast/index.ts` (whitelist already covers `/properties`, `/avm/value`, `/listings/sale`).
- `supabase/functions/deep-scan/index.ts` (evaluation JSON schema and GPT-5.5 model stay).
- Any engine listed as protected in `AGENTS.md`.
- Motivation Score card, Ownership card structure below the identity strip, RentCast Comps card, permits/violations/distress cards.

## Verification

- `npx tsgo --noEmit --pretty false` clean.
- Manual: run one address that previously returned "Not verified" and confirm one of the four sources fills in the owner name with a source badge.
- Manual: run Deep Scan on a real capture and confirm the evaluation card renders as the two-column memo with sections ordered by priority.
