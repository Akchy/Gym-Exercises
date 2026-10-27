# GymFree: Google sign-in, cloud sync and offline mode

Status: approved 2026-10-27; implemented (see `docs/superpowers/plans/2026-10-27-supabase-sync.md`).

## Why

People train with their phone at the gym and check progress on a PC at home. Today all data
lives encrypted in one browser behind a passphrase, so a second device starts empty. Signing in
with Google lets the same plan, workouts and progress appear on every device.

## Goals

1. **Continue with Google** (the only sign-in method). After signing in once, the user goes
   straight into the app on later visits until they sign out.
2. **Cloud save** to the owner's existing Supabase project: each signed-in user's data is
   saved there and loaded on any device where they sign in.
3. **Works offline when signed in**: the app opens and logging works without a connection.
   Changes are kept on the device and uploaded automatically when the connection returns.
4. **Use without an account**: a first-screen choice that keeps data on this device only,
   fully offline, as the app works today.
5. **Drop the lock concept**: no passphrase, no unlock screen, no auto-lock, no "Lock now".

## Non-goals

- Apple sign-in, email/password sign-in, email verification (explicitly dropped by the owner).
- Data hidden from the database owner. The owner **may read** users' data; protection is
  Supabase Row Level Security (each user can only access their own row) plus HTTPS.
- Real-time live updates between two open devices. Sync happens on load, on reconnect and
  after each save; a device picks up another device's changes the next time it syncs.
- Field-level merging of conflicting edits.
- Deleting the Google identity from Supabase Auth (needs a server function; later).
- Migrating data from the current passphrase-encrypted storage (the app is not public yet).

## Anti-goals (failure even if it "works")

- Silently losing a workout: an offline log must survive app close/reopen and reach the cloud.
- Silently overwriting a user's cloud data with a device's data (or vice versa) when signing in.
- Any third-party request besides the owner's Supabase project and Google's sign-in page.

## User experience

**First screen** (no session and no local data): app name, one-line pitch, two buttons:
"Continue with Google" and "Use without an account (this device only)". Choosing local mode
is remembered; the screen does not show again.

**Signed in**: the app as today. Saves go to the device immediately, then upload. A small,
quiet status in Settings → Account says "Synced", "Saving…" or "Offline: changes will upload
when you're back online". A toast appears when the device goes offline/online (already exists).

**Signing in after using local mode** (Settings → Account → "Sign in with Google to sync"):
- Account has no saved data → this device's data is uploaded to the account.
- Account has data → ask once: "Keep your account data" (device data is replaced) or
  "Replace it with this device's data". Never merge silently.

**Settings**
- Remove: Security card (change passphrase, Lock now), auto-lock setting.
- Add **Account** card: signed in as *email* (from Google) + sync status, **Sign out**; or in
  local mode, "Data is stored on this device only" + **Sign in with Google to sync**.
- Backup becomes a plain JSON download / restore (no passphrase). Restore still goes through
  `sanitizeState()` and asks for confirmation.
- **Delete my data**: signed in → deletes the user's row in Supabase and the device copy, then
  signs out. Local mode → clears device data. Both return to the first screen.

**Sign out** removes the device copy of the user's data (so the next person on a shared
device sees nothing) and returns to the first screen. If changes are still waiting to upload,
warn first: "Some changes haven't uploaded yet. Sign out anyway?"

## How it works (decided)

- **Library**: `@supabase/supabase-js` for Google OAuth (PKCE), session storage and refresh.
  It is the app's only runtime dependency. Reading/writing data also goes through it.
- **Config** (build time, public values): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  (the `sb_publishable_…` key; safe in client code because RLS protects the data). If they are
  not set, the app runs in local-only mode and hides Google sign-in (useful for forks/dev).
  The GitHub Pages workflow reads them from repository **variables** (not secrets).
- **Database** (`deploy/supabase/schema.sql`, replaces the vault table):
  `user_data (user_id uuid primary key default auth.uid() references auth.users on delete
  cascade, data jsonb not null, updated_at timestamptz not null)`, RLS on, select/insert/update/
  delete only where `auth.uid() = user_id`, plus a size limit on `data` (e.g. 5 MB).
- **Data shape**: the existing `AppState` JSON, one row per user, plus an `updatedAt`
  timestamp. Everything loaded from the cloud, the device or a backup goes through
  `sanitizeState()` as today.
- **Device copy**: `localStorage`, unencrypted. Keys: local-mode data; per-user cached data
  with `updatedAt` and a "needs upload" flag; the remembered mode. The theme key stays.
- **Sync rule (last write wins)**: every change sets `updatedAt` and marks "needs upload".
  An upload runs after each save and on the `online` event; a failed upload is retried on the
  next save/online event. On app start (signed in): show the device copy immediately, then fetch
  the cloud row; whichever has the newer `updatedAt` wins (newer cloud replaces the device copy
  and re-renders, unless the user is mid-workout on the log page, in which case apply after
  they save or leave the page; newer device copy is uploaded).
- **OAuth redirect**: back to the site's own URL (origin + base path, e.g.
  `https://akchy.github.io/Gym-Exercises/`). Works with the hash router because the PKCE code
  arrives in the query string.
- **CSP**: the build-time meta tag adds the Supabase origin to `connect-src`. The static header
  configs (`vercel.json`, `public/_headers`, `deploy/nginx/nginx.conf`) cannot know that URL,
  so they drop their `Content-Security-Policy` except `frame-ancestors 'none'` (two CSPs are
  both enforced, so a header with `connect-src 'self'` would block Supabase).
- **Service worker**: unchanged rule; requests to other origins (Supabase) are never cached.
- **Removed code**: `core/crypto.ts`, `core/vault.ts`, `core/passphrase.ts`, `ui/views/lock.ts`,
  the storage adapters (`Http…`, `Supabase…`, `Memory…` except as a test helper) and the
  `VITE_STORAGE_BACKEND`/`VITE_STORAGE_URL` options, with their tests. README security section
  is rewritten to match (no "encrypted, we can't read it" claims anywhere in the UI or docs).

## Owner setup (to be documented in README)

1. Supabase → SQL editor: run `deploy/supabase/schema.sql`.
2. Google Cloud console: create an OAuth client (Web), authorised redirect URI
   `https://<project>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Providers → Google: paste client ID/secret, enable.
4. Supabase → Authentication → URL configuration: Site URL
   `https://akchy.github.io/Gym-Exercises/`; add `http://localhost:5173/` and
   `http://localhost:4173/` for development.
5. GitHub → Settings → Secrets and variables → Actions → Variables: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`. Locally: `.env.local` with the same names.

## Testing

- Unit tests with a fake Supabase client: sign-in/out, first-screen choice, sync decisions
  (newer side wins, offline queue, retry on reconnect), sign-in-later with empty/non-empty
  account, delete, sign-out warning, data validation of cloud rows.
- E2E (no real Google): local mode end to end, offline logging, first screen, settings
  without lock UI. The signed-in path is covered by unit tests.

## Left to the builder

File/module layout, exact wording of messages, how the sync status is displayed, retry
timing details, and test structure, within the decisions above.

## Builder's calls (made while writing this, check them)

- No real-time updates between open devices (sync on load/reconnect/save only).
- Mid-workout protection: a newer cloud copy waits until the workout is saved or the log
  page is left.
- Sign out clears the device copy and warns if changes haven't uploaded.
- Missing Supabase config → local-only mode with Google sign-in hidden.
- Static header files drop their CSP (kept only in the build-generated meta tag), except
  `frame-ancestors`.
- Plain JSON backup/restore replaces encrypted backups.
- Self-hosted HTTP storage backend option is removed.
- Without Supabase config the first screen is skipped entirely (local mode is the only option).
- `updated_at` is written by the client (the device's save time), not by a database trigger,
  so "newest wins" compares the times the user actually made the changes. Small clock
  differences between devices are accepted.
