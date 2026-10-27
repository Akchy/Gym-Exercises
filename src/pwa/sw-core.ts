/**
 * Service-worker logic (pure, dependency-injected so it can be unit tested).
 *
 * - install: precache the whole built app (shell, JS/CSS, exercise photos, icons).
 * - activate: delete caches from older versions.
 * - fetch: page navigations are network-first (fresh deploys win) with the cached shell
 *   as offline fallback; precached files are cache-first (instant loads, offline).
 *   Anything else (e.g. a storage API) is not intercepted.
 */
export const CACHE_PREFIX = 'gymfree-';

export interface CacheLike {
  addAll(requests: Request[]): Promise<void>;
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface SwDeps {
  caches: CacheStorageLike;
  fetch: (request: Request, init?: RequestInit) => Promise<Response>;
  /** Absolute scope URL, e.g. https://example.com/ */
  scope: string;
  version: string;
  /** Precache entries relative to scope ("", "index.html", "assets/x.js", ...). */
  manifest: readonly string[];
}

export const cacheName = (version: string) => `${CACHE_PREFIX}${version}`;

export function precacheUrls(deps: Pick<SwDeps, 'scope' | 'manifest'>): string[] {
  return [...new Set(deps.manifest.map((p) => new URL(p, deps.scope).href))];
}

export async function install(deps: SwDeps): Promise<void> {
  const cache = await deps.caches.open(cacheName(deps.version));
  // "reload" skips the browser's HTTP cache, so this version never stores an older page or file.
  await cache.addAll(precacheUrls(deps).map((url) => new Request(url, { cache: 'reload' })));
}

export async function activate(deps: Pick<SwDeps, 'caches' | 'version'>): Promise<string[]> {
  const keep = cacheName(deps.version);
  const stale = (await deps.caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX) && k !== keep);
  await Promise.all(stale.map((k) => deps.caches.delete(k)));
  return stale;
}

export type Strategy = 'navigate' | 'precached' | 'passthrough';

export function strategyFor(request: Pick<Request, 'url' | 'method' | 'mode'>, deps: Pick<SwDeps, 'scope' | 'manifest'>): Strategy {
  if (request.method !== 'GET') return 'passthrough';
  const url = new URL(request.url);
  const scope = new URL(deps.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return 'passthrough';
  if (request.mode === 'navigate') return 'navigate';
  const clean = `${url.origin}${url.pathname}`;
  return precacheUrls(deps).includes(clean) ? 'precached' : 'passthrough';
}

/** Returns a response, or null when the request should go straight to the network. */
export async function handleFetch(request: Request, deps: SwDeps): Promise<Response | null> {
  const strategy = strategyFor(request, deps);
  if (strategy === 'passthrough') return null;
  const cache = await deps.caches.open(cacheName(deps.version));
  if (strategy === 'precached') {
    const url = new URL(request.url);
    return (await cache.match(`${url.origin}${url.pathname}`)) ?? deps.fetch(request);
  }
  try {
    // "no-cache": always check with the server. A page reused from the HTTP cache after a deploy
    // would ask for app files that no longer exist and never start.
    const response = await deps.fetch(request, { cache: 'no-cache' });
    if (response.ok) return response;
    throw new Error(`HTTP ${response.status}`);
  } catch {
    const shell = (await cache.match(new URL('index.html', deps.scope).href)) ?? (await cache.match(deps.scope));
    return shell ?? new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}
