# GymFree: free gym exercise planner

A fast, subscription-free web app that:

1. Asks for your **goal**: build muscle, gain weight, lose weight/fat, slim down (reduce muscle bulk), get stronger without bulking, improve stamina, or stay fit.
2. Asks about your **daily routine**: training days, session length, time of day, how active the rest of your day is, and the equipment you have.
3. **Suggests a weekly plan** (e.g. Push/Pull/Legs, Upper/Lower, full-body circuits), the muscle groups to focus on (chest, back, legs, shoulders, arms, core, cardio…), and sets/reps/rest suited to the goal. It also gives tips and an optional calorie/protein estimate.
4. Shows each exercise with **professional photos**: start and end positions that cross-fade as a small animation, or shown side by side as still images (automatic for users who prefer reduced motion).
5. Keeps the **weekly plan fixed and simple**: tap any exercise to see how to do it in place. Everything (days, muscle groups, exercises, sets, reps, rest, cardio) can be customised behind **Edit plan**.
6. **Guided logging**: each exercise starts with one set, with its target and how-to right there; add sets as you go.
7. **Tracks progress**: workout log, personal records, estimated-1RM charts, body-weight trend, weekly streaks, sets per muscle group.
8. **Sign in with Google** to see the same plan and progress on phone and computer, or **use it without an account** (data stays on that device).
9. **Installable and offline**: a Progressive Web App that installs to the home screen or desktop and works without a connection after the first visit. Signed-in changes made offline upload when the connection returns.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests (Vitest + jsdom)
npm run test:coverage
npm run test:e2e       # end-to-end tests (Playwright, desktop + mobile, against the production build)
npm run build          # static site in dist/
```

Without Supabase settings the app runs as a this-device-only app (no sign-in). To enable
Google sign-in locally, copy `.env.example` to `.env.local` and fill in the two values.

## Accounts, sync & privacy

| Concern | How it is handled |
| --- | --- |
| Sign-in | Google only, through Supabase Auth (PKCE). No passwords are handled by the app. |
| Cloud data | One row per user in `public.user_data` (`deploy/supabase/schema.sql`). **Row Level Security** lets each user read and write only their own row. The project owner can read all rows in the Supabase dashboard. |
| On the device | A copy is kept in `localStorage` as plain JSON so the app opens and logs workouts offline. Signing out removes it. Without an account it is the only copy. |
| Sync | Changes save on the device first, then upload. Offline changes are queued and upload when the connection returns. An upload never overwrites changes made on another device in the meantime: the two are merged (workouts and body-weight entries from both are kept, deleted workouts stay deleted, the more recent plan and settings win). Data arriving mid-workout waits until the workout is saved or left. An unfinished workout is kept on the device until it is saved or discarded. |
| Validation | Everything loaded from the cloud, the device or a backup file goes through `sanitizeState()` (unknown fields dropped, numbers clamped, enums checked). |
| XSS | No `innerHTML`: all text goes through `textContent`. Strict CSP meta tag generated at build time (`script-src 'self'`, `connect-src` limited to the site and your Supabase project, `object-src 'none'`). No analytics or trackers. |
| Keys | Only the public Supabase URL and **publishable key** (`sb_publishable_…`) ship in the app; the app refuses to start with a secret key. The Google client secret lives only in the Supabase dashboard; secret / `service_role` keys are never used. |
| Headers | HSTS, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, restrictive `Permissions-Policy` (`vercel.json`, `public/_headers`, `deploy/nginx/nginx.conf`). |

## Supabase + Google setup (one time)

1. **Database**: Supabase → SQL editor → run `deploy/supabase/schema.sql`.
2. **Google keys**: Google Cloud console → APIs & Services → Credentials → Create OAuth client ID (Web application). Authorised redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`. (Configure the OAuth consent screen first if asked.)
3. **Enable Google in Supabase**: Authentication → Sign In / Providers → Google → paste the client ID and client secret → Save.
4. **Allowed return addresses**: Authentication → URL Configuration → Site URL `https://<user>.github.io/<repo>/`; Redirect URLs: add that URL plus `http://localhost:5173/` and `http://localhost:4173/` for development.
5. **Give the app the public settings**: GitHub repo → Settings → Secrets and variables → Actions → **Variables** tab: `VITE_SUPABASE_URL` (Project Settings → API → Project URL) and `VITE_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API Keys → **Publishable key**, starts with `sb_publishable_`). Locally: `.env.local` with the same names.

## Architecture

```
src/
  core/   pure logic: device store, Supabase cloud, sync rules, planner, progress, validation
  data/   exercise library (49 exercises), photo index, stick-figure fallback poses
  pwa/    service-worker logic (precache, offline fallback) and install prompt
  ui/     tiny DOM helpers, photo demos, chart, one file per screen
  sw.ts   service-worker entry (built to /sw.js with the precache list injected)
  main.ts wires device store + cloud -> repository -> app, registers the service worker
public/exercises/  start/end photos (WebP, ~1.4 MB total)
scripts/fetch_exercise_images.py  reproducible photo download + conversion
tests/unit  Vitest (Supabase replaced by an in-memory fake)
tests/e2e   Playwright (desktop + mobile, incl. offline mode; runs the no-account flow)
```

No UI framework; the only runtime dependency is `@supabase/supabase-js` (sign-in and data). Photos are small WebP files that load lazily, and the service worker caches everything, so repeat visits load instantly, even offline. Requests to Supabase are never cached.

## Offline & install

- The production build emits `sw.js` with a list of every built file (app, photos, icons). The cache version is a hash of their contents, so each deploy updates cleanly.
- Pages are network-first, falling back to the cached app when offline; static files are cache-first. Supabase calls are never cached.
- `manifest.webmanifest` and icons make it installable (Chrome/Edge/Android prompt, iOS "Add to Home Screen"). Settings → *Install & offline* explains it per platform.
- The service worker is only registered in production builds (`npm run build && npm run preview` to try it locally). Hosts must serve `sw.js` with `Cache-Control: no-cache` (already set in the provided configs).

## Image credits

Exercise photos come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db), released into the public domain (Unlicense). Two exercises without photos (pike push-up, burpee) use the built-in stick-figure animation.

## Deployment

`npm run build` produces a static site in `dist/` that runs anywhere.

**Public hosting**
- **Vercel**: import the repo; `vercel.json` configures the build and security headers.
- **Netlify / Cloudflare Pages**: build `npm run build`, publish `dist`; headers come from `public/_headers`.
- **GitHub Pages** (set up): `.github/workflows/deploy.yml` tests and deploys every push to `main`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**. The site is served from `https://<user>.github.io/<repo>/`; the workflow passes that subfolder to the build as `BASE_PATH` (a custom domain switches it back to `/` automatically). The CSP is embedded as a meta tag; Pages cannot send the other security headers from `public/_headers`.
- **Subfolder builds elsewhere**: `BASE_PATH=/my-folder/ npm run build` (and the same variable for `npm run test:e2e`).

**Closed / private hosting (AWS, Azure, on-prem)**
- `docker build -t gymfree . && docker run -p 8080:8080 gymfree` (unprivileged nginx with security headers), for ECS/EKS, Azure Container Apps, etc.
- Or upload `dist/` to S3 + CloudFront / Azure Static Web Apps.

Every host needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time for sign-in (Docker: `--build-arg`), and its address added to Supabase's Redirect URLs.

CI (`.github/workflows/ci.yml`) runs type checking, unit tests with coverage, and the Playwright E2E suite on branches and pull requests; `deploy.yml` runs them on `main` before deploying.

## Disclaimer

Plans and calorie estimates are general guidance, not medical advice.
