# Edge functions
- Paid/proxy functions call `requireUser()` from `_shared/edge-auth.ts` (signed-in user + daily cap in `edge_usage`; service role / cron secret bypass) — ties paid API spend to real accounts.
