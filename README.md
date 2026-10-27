# GymFree: free gym exercise planner

A fast, subscription-free web app that:

1. Asks for your **goal**: build muscle, gain weight, lose weight/fat, slim down (reduce muscle bulk), get stronger without bulking, improve stamina, or stay fit.
2. Asks about your **daily routine**: training days, session length, time of day, how active the rest of your day is, and the equipment you have.
3. **Suggests a weekly plan** (e.g. Push/Pull/Legs, Upper/Lower, full-body circuits), the muscle groups to focus on (chest, back, legs, shoulders, arms, core, cardio…), and sets/reps/rest suited to the goal. It also gives tips and an optional calorie/protein estimate.
4. Shows each exercise as a **small stick-figure animation** or as **still start/end images** (automatic for users who prefer reduced motion).
5. Lets users **customise everything**: days, muscle groups, exercises, sets, reps, rest, cardio.
6. **Tracks progress**: workout log, personal records, estimated-1RM charts, body-weight trend, weekly streaks, sets per muscle group.
7. **Remembers the user** between visits, with all data **encrypted on the device**.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests (Vitest + jsdom)
npm run test:coverage
npm run test:e2e       # end-to-end tests (Playwright, desktop + mobile, against the production build)
npm run build          # static site in dist/
```

## Security & privacy

| Concern | How it is handled |
| --- | --- |
| Data at rest | All user data (profile, goals, plan, workouts, body weight) is encrypted with **AES-256-GCM** before it is stored. Nothing is stored in plaintext. |
| Key | Derived from the user's passphrase with **PBKDF2-HMAC-SHA-256, 600,000 iterations**, random 128-bit salt; fresh random 96-bit IV per save. The key is a non-extractable `CryptoKey` kept in memory only while unlocked. |
| Passphrase | Never stored or transmitted. Minimum 10 characters; common passwords rejected. A forgotten passphrase cannot be recovered (zero-knowledge), so users can keep an encrypted backup. |
| Tampering | GCM authentication with associated data rejects modified ciphertext. Decrypted/imported data is validated by `sanitizeState()` (unknown fields dropped, numbers clamped, enums checked). |
| XSS | No `innerHTML`: all text goes through `textContent`. Strict CSP (`script-src 'self'`, no inline scripts/styles, `object-src 'none'`). No third-party scripts, fonts, analytics or trackers. |
| Session | Lock button and auto-lock after inactivity (configurable). Locking discards the decrypted state and the key. Progressive delay after repeated wrong passphrases. |
| Headers | HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, restrictive `Permissions-Policy` (`vercel.json`, `public/_headers`, `deploy/nginx/nginx.conf`). |
| Server storage | Optional backends receive **ciphertext only**, so even the database owner cannot read user data. |

## Architecture

```
src/
  core/   pure logic: crypto, vault, storage adapters, planner, progress, validation
  data/   exercise library (49 exercises) + stick-figure key poses
  ui/     tiny DOM helpers, SVG figure renderer, chart, one file per screen
  main.ts wires storage -> vault -> app
tests/unit  Vitest (171 tests, ~99% line coverage)
tests/e2e   Playwright (8 scenarios x desktop + mobile)
```

No UI framework and no runtime dependencies: the whole app is about **29 KB gzipped** and makes no network calls, so it loads fast. Animations are SVG + SMIL (no video/GIF downloads), mounted lazily and paused off-screen.

## Deployment

`npm run build` produces a static site in `dist/` that runs anywhere.

**Public hosting**
- **Vercel**: import the repo; `vercel.json` configures the build and security headers.
- **Netlify / Cloudflare Pages**: build `npm run build`, publish `dist`; headers come from `public/_headers`.
- **GitHub Pages**: publish `dist/` (the CSP is also embedded as a meta tag).

**Closed / private hosting (AWS, Azure, on-prem)**
- `docker build -t gymfree . && docker run -p 8080:8080 gymfree` (unprivileged nginx with security headers), for ECS/EKS, Azure Container Apps, etc.
- Or upload `dist/` to S3 + CloudFront / Azure Static Web Apps.

**Storage backends** (build-time env, see `.env.example`):
- `VITE_STORAGE_BACKEND=local` *(default)*: encrypted data stays in the user's browser.
- `VITE_STORAGE_BACKEND=http` + `VITE_STORAGE_URL=/api/storage`: encrypted blobs go to your own API (`GET/PUT/DELETE {url}/{key}`), e.g. behind an SSO proxy on a private network.
- `SupabaseStorageAdapter` (`src/core/storage.ts`) + `deploy/supabase/schema.sql` (row-level security) are ready for cloud sync once a sign-in flow is chosen.

CI (`.github/workflows/ci.yml`) runs type checking, unit tests with coverage, and the Playwright E2E suite.

## Disclaimer

Plans and calorie estimates are general guidance, not medical advice.
