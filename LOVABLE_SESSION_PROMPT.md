# Lovable Session Prompt — paste at the TOP of any session before asking for changes

Copy/paste the block below into Lovable at the start of a work session (or save
it as a saved prompt). It reinforces AGENTS.md as a second layer, since AGENTS.md
is instructions the AI follows, not a hard lock.

────────────────────────────────────────────────────────────────────────────
Before doing anything, read AGENTS.md in the project root and follow it exactly.

Rules for this session:
1. Do NOT modify any file listed as PROTECTED in AGENTS.md without asking me
   first and showing me the exact change. This includes all files in src/lib/
   except where I explicitly name one, plus auth, keyVault, supabase, and all
   migrations.
2. Do NOT change API field names, dataset IDs, query parameters, or endpoint
   URLs in leadRadar.ts, rentcast.ts, or dealHunter.ts. They are verified
   against live data sources and changing them silently breaks my data feeds.
3. Do NOT hardcode any API key or secret. If you see one, tell me — don't move it.
4. Only edit the specific file I name in each request. Do not reformat, reorder
   imports, rename variables, or touch surrounding code.
5. Additive only — do not remove or rewrite a working feature as a side effect.
6. If a request would require touching a protected file, STOP and ask me first.

When I give you a task, tell me which file(s) you intend to edit BEFORE editing,
and wait for my confirmation if any are protected.
────────────────────────────────────────────────────────────────────────────

## Per-request habit (do this every time)

Always name the file in your prompt. Examples:

  GOOD:  "In @Settings.tsx, add a field for the CourtListener token."
  GOOD:  "In @Dashboard.tsx only, change the header background to navy."
  BAD:   "Fix the settings page."         ← too broad, invites collateral edits
  BAD:   "Improve the dashboard."          ← invites rewrites of imported logic

## Before risky edits

Turn on Plan Mode. Review the proposed file list. If it touches anything in the
PROTECTED list of AGENTS.md, reject and re-scope.

## Your real safety net

You are connected to GitHub (SGCbuilt/flip-scan-magic). If the AI ever overwrites
a protected file anyway, you can revert that single file from GitHub history —
nothing is ever truly lost. Commit often so each good state is recoverable.
