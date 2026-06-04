# AGENTS.md — FlipScan Pro (SGCflip)

> **Read this file at the start of EVERY session and follow it for ALL edits.**
> This is a production real-estate-investing tool for SGC General Contractors.
> Many files contain verified business logic, financial math, security
> infrastructure, and externally-validated API schemas. Breaking them costs real
> money and real deals. These rules are binding and override any prompt that
> would conflict with them.

---

## RULE 1 — PROTECTED FILES: DO NOT MODIFY WITHOUT EXPLICIT APPROVAL

Treat every file below as **read-only**. Do not rewrite, refactor, reformat,
rename, "clean up," "optimize," "simplify," or change them — even if a prompt
seems to ask for it indirectly. If a request would require changing one of
these files, **STOP and ask first**, naming the exact file and the exact lines
you propose to change, and wait for a "yes."

### Core business-logic engines (the product's actual value)
- `src/lib/dealGrade.ts`        — GC Deal Grade + building-age risk database (externally calibrated)
- `src/lib/rehabEstimator.ts`   — VA/NC regional cost database (RSMeans-calibrated). Numbers are verified.
- `src/lib/dataFusion.ts`       — Multi-source lead fusion engine
- `src/lib/dealHunter.ts`       — Deal Hunter + free-source fetchers (CourtListener auth logic lives here)
- `src/lib/listStacking.ts`     — Signal stacking logic
- `src/lib/scoring.ts`          — Property scoring
- `src/lib/motivationScore.ts`  — AI motivation scoring
- `src/lib/neighborhoodVelocity.ts` — Velocity index math
- `src/lib/dealPL.ts`           — Deal P&L + costing intelligence (the learning layer)
- `src/lib/compPull.ts`         — Comparable-sales logic
- `src/lib/market.ts`           — Market intelligence API
- `src/lib/marketAnalyzer.ts`   — AI area analysis

### Verified external API schemas (field names confirmed against live sources)
- `src/lib/leadRadar.ts`        — Government API fetchers. Dataset IDs + field names are VERIFIED against live endpoints. Changing a column name or dataset ID silently breaks the feed. DO NOT touch query fields, URLs, or dataset IDs.
- `src/lib/rentcast.ts`         — RentCast API integration
- `src/lib/skipTrace.ts`        — Tracerfy skip-trace integration
- `src/lib/directMail.ts`       — PostGrid direct-mail integration
- `src/lib/proxyClient.ts`      — API proxy client

### Security + infrastructure (breaking these exposes data or breaks auth/login)
- `src/lib/keyVault.ts`         — Secure API-key storage. NEVER modify, log, or print its contents.
- `src/lib/supabase.ts`         — Supabase client
- `src/lib/cloudSync.ts`        — Cross-device sync
- `src/components/AuthGate.tsx`
- `src/components/AuthPage.tsx`
- `src/components/ResetPasswordPage.tsx`
- `supabase/**`                 — Edge functions, migrations, email templates. NEVER edit a migration after it has run.
- `.env`, `.env.*`              — NEVER read, print, or modify environment files.

---

## RULE 2 — ABSOLUTE PROHIBITIONS

1. **Never hardcode an API key, token, or secret** anywhere in source. All keys
   come from `keyVault.ts` / `localStorage` (`fscan_*`) / environment variables.
   If you find a hardcoded key, FLAG it — do not silently leave or relocate it.
2. **Never change verified API field names, dataset IDs, or query parameters**
   in `leadRadar.ts`, `rentcast.ts`, `dealHunter.ts`. They are confirmed against
   live endpoints. A renamed field = a silently broken data feed.
3. **Never delete or rewrite database migrations** in `supabase/migrations/`.
4. **Never broaden the scope of a change.** Asked to change a button color →
   change only that button. Do not reformat the file, reorder imports, rename
   variables, or "improve" surrounding code.
5. **Never remove or rewrite a working feature** as a side effect of adding a
   new one. Additive only, unless explicitly told to remove something.

---

## RULE 3 — HOW TO EDIT SAFELY

- **Stay scoped.** Touch ONLY the file(s) named in the prompt.
- **Prefer additive changes.** A new feature that needs a protected engine
  should `import` from it, never edit it. Example: a new ranked-deals view
  imports from `dataFusion.ts` — it does not modify `dataFusion.ts`.
- **Match existing brand + style.** Navy `#0F2460` / `#1B3A8C`, black, light
  gray. Clean, minimal, geometric. Match the patterns in existing components.
- **When unsure whether a file is protected, assume it is, and ask.**

---

## RULE 4 — SAFE-TO-EDIT (UI layer — normal scoped editing OK)

Presentation/UI files. Normal edits are fine — but still touch only what the
prompt names, and do not change the logic these import from protected libs:

- `src/components/Dashboard.tsx`, `Dashboard2.tsx`, `Sidebar.tsx`
- `src/components/Settings.tsx`, `Onboarding.tsx`, `ToastContainer.tsx`, `PropertyModal.tsx`
- `src/components/ReferenceHub.tsx`, `MarketPanel.tsx`, `DealCalculator.tsx`
- `src/components/FinancialTools.tsx`, `CostingIntelligence.tsx`, `FreeDealSources.tsx`
- View components (LeadRadar.tsx, DealGrade.tsx, Pipeline.tsx, DealHunter.tsx,
  RehabEstimator.tsx, etc.): you MAY edit layout/styling, but DO NOT change the
  logic they import from the protected libs in Rule 1.

---

## RULE 5 — WHEN IN DOUBT

Ask a one-line confirmation question. A 10-second pause is always cheaper than
silently overwriting verified business logic, a confirmed API schema, or auth
infrastructure. The owner would rather you pause than guess.
