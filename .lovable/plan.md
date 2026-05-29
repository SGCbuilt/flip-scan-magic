## Goal
Stop re-entering API keys (RentCast, Anthropic, Tracerfy, etc.) on every session/device. Tie them to your account in the cloud.

## What I'll build

### 1. Auth (email + password + Google)
- New `/auth` page (sign up + sign in + Google button)
- Wrap the app in an auth gate — if not logged in, show auth screen
- Sign out button in Settings

### 2. Cloud-stored API keys (per user)
New table `public.user_api_keys`:
```
user_id uuid (FK auth.users, unique)
rentcast text
anthropic text
tracerfy text
attom text
supabase_url text
supabase_anon text
updated_at timestamptz
```
- RLS: each user can only read/write their own row
- Encrypted at rest (Postgres default)

### 3. Sync layer (`src/lib/keyVault.ts`)
- On login: pull row from `user_api_keys` → write to `localStorage` (so all existing code that reads `localStorage.getItem('fscan_rentcast')` keeps working unchanged)
- On save (Settings or Onboarding): write to both `localStorage` and `user_api_keys` (upsert)
- On logout: clear key entries from localStorage

### 4. Minor edits
- `Onboarding.tsx` — also push to cloud, only show if no keys after cloud-pull
- `Settings.tsx` — same hook on save, add Sign Out button
- `App.tsx` — auth gate + hydrate keys before rendering app

## What stays the same
- All ~40 components keep reading keys from `localStorage` — no refactor needed
- Existing `cloudSync.ts` (pipeline/tasks) untouched
- No changes to edge functions

## Out of scope
- Migrating other localStorage data (pipeline/tasks already have cloudSync)
- Password reset flow (can add later if needed)
- Team sharing of keys
