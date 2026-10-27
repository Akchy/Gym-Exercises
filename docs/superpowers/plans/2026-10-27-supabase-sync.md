# Google sign-in, cloud sync and offline mode: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the passphrase vault with a device store plus optional Google sign-in that syncs one JSON row per user to Supabase, working offline.

**Architecture:** `core/store.ts` keeps the device copy in localStorage (plain JSON). `core/cloud.ts` defines a small `Cloud` interface with a Supabase implementation (`supabase-js`) and is faked in tests. `core/sync.ts` holds the pure "which side wins" decision and a `Repository` that owns mode, user, device copy, upload queue and status. `ui/app.ts` uses the Repository instead of the Vault; the lock screen is replaced by a welcome screen.

**Tech Stack:** TypeScript, Vite, Vitest + jsdom, Playwright, `@supabase/supabase-js@2.117.3` (exact pin).

**Spec:** `docs/superpowers/specs/2026-10-27-supabase-sync-design.md`

## Global Constraints

- Sign-in: Google only, PKCE flow, `redirectTo` = `location.origin + import.meta.env.BASE_URL`.
- Config: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; both missing → local-only, no first screen, no Google button.
- Table `public.user_data (user_id uuid pk default auth.uid(), data jsonb, updated_at timestamptz)`, RLS own-row only, `data` < 5 MB; `updated_at` written by the client.
- Everything read from cloud, device or a backup file goes through `sanitizeState()`.
- localStorage keys (prefix `gymx:`): `mode` (`local`|`cloud`), `local` (local-mode record), `user` (remembered `{id,email}`), `cache:<userId>` (cloud-mode record), `theme` (unchanged).
- Device record shape: `{ state: AppState, updatedAt: string /* ISO */, dirty: boolean }`.
- No UI text or docs may claim data is encrypted or unreadable by the owner.
- Only runtime dependency: supabase-js. No new third-party origins besides the Supabase project and Google sign-in.

## Review Focus

1. Offline start while signed in with an expired token → app opens on the cached data (remembered user), no sign-out, no data loss. Test in Task 2 (`starts offline from the remembered user`).
2. Upload fails (network) → `dirty` stays true, status "offline", retried on `online`. Test in Task 2.
3. Cloud row with malformed `data` → sanitized or ignored, never crashes the app. Test in Task 2.
4. Sign out with pending changes → confirm; cancel keeps everything. Test in Task 4.
5. Newer cloud copy arriving while on `/log/<id>` → not applied until save/leave; a saved workout lands on top of the newer cloud state. Test in Task 3.

---

### Task 1: Device store + cloud interface (no UI)

**Files:**
- Create: `src/core/store.ts`, `src/core/cloud.ts`
- Test: `tests/unit/store.test.ts`

**Interfaces (Produces):**
- `store.ts`: `type Mode = 'local' | 'cloud'`; `interface DeviceRecord { state: AppState; updatedAt: string; dirty: boolean }`; `class DeviceStore { constructor(storage?: Storage); mode(): Mode | null; setMode(m: Mode | null): void; read(key: RecordKey): DeviceRecord | null; write(key: RecordKey, r: DeviceRecord): void; remove(key: RecordKey): void; rememberedUser(): CloudUser | null; rememberUser(u: CloudUser | null): void }` with `type RecordKey = 'local' | { user: string }`. `read` sanitizes and returns null for missing/corrupt data.
- `cloud.ts`: `interface CloudUser { id: string; email: string | null }`; `interface CloudRecord { data: unknown; updatedAt: string }`; `interface Cloud { currentUser(): Promise<CloudUser | null>; signInWithGoogle(): Promise<void>; signOut(): Promise<void>; fetch(userId: string): Promise<CloudRecord | null>; save(userId: string, data: AppState, updatedAt: string): Promise<void>; remove(userId: string): Promise<void> }`; `createSupabaseCloud(url: string, publishableKey: string, redirectTo: string): Cloud`; `cloudFromEnv(env): Cloud | null`.

- [ ] Tests: round-trip a record; corrupt JSON → null; mode/user persistence; keys are `gymx:local`, `gymx:cache:<id>`, `gymx:mode`, `gymx:user`; `cloudFromEnv({})` → null, with both vars → object; `createSupabaseCloud('http://x', …)` throws (https required except localhost).
- [ ] Implement; `npm i -E @supabase/supabase-js@2.117.3`. Run `npx vitest run tests/unit/store.test.ts` → PASS.

### Task 2: Sync decision + Repository

**Files:** Create `src/core/sync.ts`; Test `tests/unit/sync.test.ts` (with `FakeCloud` in `tests/unit/helpers.ts`).

**Interfaces (Produces):**
- `decide(device: DeviceRecord | null, cloud: CloudRecord | null): 'use-cloud' | 'upload-device' | 'in-sync' | 'none'` (newer `updatedAt` wins; equal → `in-sync`; dirty device with equal/newer time → `upload-device`).
- `type SyncStatus = 'local' | 'synced' | 'saving' | 'offline'`.
- `class Repository { constructor(store: DeviceStore, cloud: Cloud | null, opts?: { now?: () => Date; online?: () => boolean }); readonly cloudEnabled: boolean; mode: Mode | null; user: CloudUser | null; status: SyncStatus; start(): Promise<StartResult>; chooseLocal(): AppState; save(state: AppState): Promise<void>; upload(): Promise<void>; pull(): Promise<AppState | null>; resolveLink(choice: 'account' | 'device'): Promise<AppState>; signIn(): Promise<void>; signOut(): Promise<void>; hasPendingChanges(): boolean; deleteAll(): Promise<void>; onStatus(fn: (s: SyncStatus) => void): void }`.
- `type StartResult = { kind: 'welcome' } | { kind: 'ready'; state: AppState } | { kind: 'link'; device: AppState; account: AppState }`.

Behaviour: `start()` — cloud user (or remembered user when `currentUser()` throws) → cloud mode, return cached state (or default) and then the app calls `pull()`; signed in with onboarded local data → if account empty upload it and clear `local`, else return `link`; no user + mode `local` (or no cloud configured) → local record or default; else `welcome`. `save()` writes device (`updatedAt = now`, `dirty` in cloud mode) then `upload()` (serialised; failure keeps dirty, status `offline`).

- [ ] Tests: `decide` table; start: welcome / local / cloud-cached / remembered-user offline / link with empty and non-empty account; save→upload→not dirty; upload failure → dirty + offline, retry succeeds; malformed cloud data ignored; signOut clears cache + user + mode; deleteAll removes row and device data.
- [ ] Implement; run `npx vitest run tests/unit/sync.test.ts` → PASS.

### Task 3: App wiring, welcome + link screens, remove lock/vault

**Files:**
- Modify: `src/ui/app.ts`, `src/ui/context.ts`, `src/main.ts`, `vite.config.ts` (CSP `connect-src` uses `VITE_SUPABASE_URL` origin), `src/vite-env.d.ts` if needed.
- Create: `src/ui/views/welcome.ts` (`renderWelcome(opts: { cloudEnabled: boolean; onGoogle(): void; onLocal(): void }): HTMLElement`, `renderLinkChoice(onChoose: (c: 'account' | 'device') => void): HTMLElement`).
- Delete: `src/core/crypto.ts`, `vault.ts`, `passphrase.ts`, `storage.ts`, `config.ts`, `src/ui/views/lock.ts`; trim `encoding.ts` to `randomId`; delete their tests.
- Tests: rewrite `tests/unit/helpers.ts` (`makeApp(initial?, { cloud?, mode? })`, no `unlock`), `tests/unit/app.test.ts`.

**Interfaces:** `new App(root, repo: Repository, opts)`; `ViewContext` loses `lock`, `vault`; gains `repo: Repository`. `ctx.destroy()` → `repo.deleteAll()` then welcome.

- [ ] Tests: welcome shows both buttons when cloud enabled, none when not (straight to onboarding); "Use without an account" → onboarding; edits persist to `gymx:local`; link screen both choices; newer cloud state applied on dashboard but deferred on `/log/…` and a saved workout lands on the newer state; save failure toast; offline/online toasts; no lock/auto-lock remains.
- [ ] Implement; `npm run typecheck && npx vitest run` → PASS.

### Task 4: Settings account card + plain backups

**Files:** Modify `src/ui/views/settings.ts`; Test `tests/unit/views.test.ts` (settings + remove lock-screen tests).

- Account card: cloud → "Signed in as {email}", status text in `.sync-status` (`Synced` / `Saving…` / `Offline: changes will upload when you're back online`), **Sign out** (confirm "Some changes haven't uploaded yet. Sign out anyway?" when `hasPendingChanges()`). Local → "Your data is stored on this device only." + **Sign in with Google to sync** (hidden if `!cloudEnabled`).
- Backup: "Download backup" → `gym-backup-YYYY-MM-DD.json` containing the `AppState` JSON; restore: file (≤10 MB) → parse → `sanitizeState` → confirm → `ctx.replaceState`. Errors: "Choose a backup file.", "That file is too large to be a backup.", "That file is not a GymFree backup."
- Delete card: wording "Permanently erase your data (on this device and, if signed in, in your account)".
- Remove Security card and auto-lock; `Settings.autoLockMinutes` removed from types/state.

- [ ] Tests for each of the above; run `npx vitest run` → PASS.

### Task 5: E2E, deploy config, schema, docs

**Files:** `tests/e2e/app.spec.ts`, `deploy/supabase/schema.sql`, `vercel.json`, `public/_headers`, `deploy/nginx/nginx.conf`, `.github/workflows/deploy.yml` (env from `vars.VITE_SUPABASE_URL` / `vars.VITE_SUPABASE_PUBLISHABLE_KEY`), `.env.example`, `README.md`.

- [ ] E2E (no Supabase env → local-only): first run goes to onboarding; data persists across reload in `gymx:local`; offline test unchanged; settings backup round-trip + delete; mobile menu; no lock UI.
- [ ] Header CSPs reduced to `frame-ancestors 'none'`; meta CSP covers the rest.
- [ ] README: owner setup steps from the spec; security section rewritten.
- [ ] `npm run typecheck && npx vitest run && npx playwright test` → all PASS. Commit.
