# Lock down paid services called from the browser

Several of the files involved are on the protected list in AGENTS.md. The plan names each one below, and nothing changes until you approve it.

## What I found (every caller)

| Function | Called from | How it authenticates today |
|---|---|---|
| rentcast | deep-scan, research-agent-run (server) | service key |
| ai-analysis | Property / Deal screens (`aiAnalysis.ts`) | signed-in user |
| property-photos | Drive for Dollars, `aiAnalysis.ts`, deep-scan | user / service key |
| transcribe-audio | Add Property (mobile voice) | signed-in user |
| market-proxy | Lead Radar area data (`leadRadar.ts`), `supabase.ts` proxyGovApi | **anon key only** |
| owner-lookup | `ownerLookup.ts`, deep-scan | user / service key |
| chatham-permits | Chatham Permits screen, research-agent-run | user / service key |
| deep-scan | Auction Radar, Drive for Dollars, `aiAnalysis.ts`, research-agent-run | user / service key |
| daily-digest | Morning Brief "Send Email Now" (`supabase.ts`) | **anon key only**, no cron job |

The public landing page only calls waitlist-signup, which this change doesn't touch.

These parts of the app call outside services directly from the browser, using keys stored there:
- **RentCast:** `rentcast.ts`, `market.ts`, `marketAnalyzer.ts`, `compPull.ts`, `proxyClient.ts`, `App.tsx`
- **Anthropic:** `dealGrade.ts`, `marketAnalyzer.ts`, `motivationScore.ts`
- **Tracerfy:** `skipTrace.ts`, `LeadRadar.tsx`, `DriveForDollars.tsx`, `ListStacking.tsx`
- **Attom:** `proxyClient.ts`

## Backend (goes live immediately)

1. **Shared sign-in check** (`_shared/edge-auth.ts`)
   - Passes callers using the service key or the cron key (reusing `isPrivilegedToken`). They are not capped.
   - Otherwise requires a real signed-in user, checked with `auth.getUser`. The bare anon key is rejected.
   - Then counts one use against that person's daily limit.
2. **Daily-limit table** (`edge_usage`)
   - One row per person, function and day, with a counter.
   - Only the server can access it.
   - Counting is done by a server-only function that adds one and checks the limit.
3. **Apply the check to all 9 functions.** The read-only RentCast paths stay whitelisted.
4. **Temporary transition mode for market-proxy and daily-digest only**
   - Until you publish, they also accept the old anon-key call, with a shared limit of 200 a day across all anonymous callers. daily-digest anon calls are limited to 3 a day.
   - Each one is marked `LEGACY_ANON_UNTIL_PUBLISH` so it's easy to remove after you publish.
5. **New server function `anthropic-proxy`** for deal-grade, market and motivation prompts. It uses the `ANTHROPIC_API_KEY` that's already stored on the server.
6. **New server function `skip-trace`** for Tracerfy, which needs a server secret (see below).

**Daily limits per person:**

| Function | Uses per day |
|---|---|
| rentcast | 400 |
| market-proxy | 500 |
| ai-analysis | 150 |
| anthropic-proxy | 200 |
| deep-scan | 100 |
| property-photos | 150 |
| owner-lookup | 200 |
| chatham-permits | 200 |
| transcribe-audio | 200 |
| skip-trace | 200 |
| daily-digest | 10 |

## App screens (live only after you publish)

**Protected files I need approval to edit:**
- **`src/lib/rentcast.ts`, `market.ts`, `compPull.ts`:** swap only the fetch helper so it goes through the `rentcast` function. Same endpoints, same fields, same parameters.
- **`src/lib/marketAnalyzer.ts`, `dealGrade.ts`, `motivationScore.ts`:** swap only the RentCast and Anthropic fetch calls to the server functions. Prompts and scoring math stay untouched.
- **`src/lib/proxyClient.ts`:** route RentCast through the server. Attom is left as a provider, with no browser key.
- **`src/lib/skipTrace.ts`:** call the new `skip-trace` function instead of Tracerfy directly. Request and response fields stay the same.
- **`src/lib/keyVault.ts`:**
  - Stop writing keys into browser storage, and clear any old `fscan_*` keys on load.
  - The `user_api_keys` table rows are left alone.
- **`src/lib/supabase.ts`:** send the signed-in user's session instead of the anon key, and drop the browser-storage overrides.
- **`src/lib/leadRadar.ts`, line ~176 only:** send the user session to market-proxy. Dataset IDs and fields stay untouched.

**Regular files:**
- **`Settings.tsx`:** remove the RentCast, Anthropic, Tracerfy and backend key fields. Show "Managed securely on the server" instead.
- **`Onboarding.tsx`:** remove the key-entry steps.
- **`LeadRadar.tsx`, `DriveForDollars.tsx`, `ListStacking.tsx`:** remove the Tracerfy key setup and checks.
- **`App.tsx`:** remove the browser-key checks.
- **`DealGrade.tsx`, `MarketAnalyzer.tsx`, `PropertyModal.tsx`:** remove the "add your key" messages.
- **`vite-env.d.ts`:** remove `VITE_ANTHROPIC_API_KEY` and `VITE_RENTCAST_KEY`.

## Testing (no emails or texts)

I'll call each function three ways: with no token (expect 401), with the anon key (expect 401, except the two transition functions), and as a signed-in user on a harmless request. I'll also confirm the cron key still passes, and check that the daily counter goes up. daily-digest gets only the 401 tests.

## Secrets and what breaks before you publish

**Secrets you must set:**
- `TRACERFY_API_KEY`: skip tracing stops working until it's added.
- `ATTOM_API_KEY`: only if you use Attom.

These are already set: `ANTHROPIC_API_KEY`, `RENTCAST_API_KEY` and `LOVABLE_API_KEY`.

**What happens on the live site before you publish:**
- Nothing breaks for signed-in screens. They already send the user's session.
- Lead Radar area data and the Morning Brief email button keep working through the transition mode.
- Browser-direct calls keep working on the old site until you publish.

**After you publish:**
- Remove the `LEGACY_ANON_UNTIL_PUBLISH` blocks. I can do that when you tell me.
- Rotate the RentCast and Anthropic keys, since they may have been exposed in browsers.

## Not touched

- Payment, invoice and other business tables.
- Email sending.
- Branding and phone numbers.
- All other logic in the protected engines.
