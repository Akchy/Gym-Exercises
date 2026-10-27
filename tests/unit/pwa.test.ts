import { describe, expect, it, vi } from 'vitest';
import {
  activate,
  cacheName,
  handleFetch,
  install,
  precacheUrls,
  strategyFor,
  type CacheLike,
  type CacheStorageLike,
  type SwDeps,
} from '../../src/pwa/sw-core';
import { InstallManager, registerServiceWorker } from '../../src/pwa/register';

class FakeCache implements CacheLike {
  store = new Map<string, Response>();
  async addAll(urls: string[]) {
    for (const u of urls) this.store.set(u, new Response(`cached:${u}`));
  }
  async match(req: Request | string) {
    const key = typeof req === 'string' ? req : req.url;
    return this.store.get(key)?.clone();
  }
  async put(req: Request | string, res: Response) {
    this.store.set(typeof req === 'string' ? req : req.url, res);
  }
}

class FakeCaches implements CacheStorageLike {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
}

function deps(overrides: Partial<SwDeps> = {}): SwDeps {
  return {
    caches: new FakeCaches(),
    fetch: vi.fn(async (r: Request) => new Response(`network:${r.url}`)),
    scope: 'https://gym.example/',
    version: 'v2',
    manifest: ['', 'index.html', 'assets/main.js', 'exercises/push-up-0.webp'],
    ...overrides,
  };
}

const req = (url: string, init: { method?: string; mode?: RequestMode } = {}) =>
  ({ url, method: init.method ?? 'GET', mode: init.mode ?? 'no-cors' }) as Request;

describe('service worker core', () => {
  it('names caches by version and resolves precache URLs against the scope', () => {
    expect(cacheName('abc')).toBe('gymfree-abc');
    expect(precacheUrls({ scope: 'https://x.dev/app/', manifest: ['', 'a.js', 'a.js'] })).toEqual(['https://x.dev/app/', 'https://x.dev/app/a.js']);
  });

  it('precaches everything on install', async () => {
    const d = deps();
    await install(d);
    const cache = (await d.caches.open('gymfree-v2')) as FakeCache;
    expect([...cache.store.keys()]).toEqual([
      'https://gym.example/',
      'https://gym.example/index.html',
      'https://gym.example/assets/main.js',
      'https://gym.example/exercises/push-up-0.webp',
    ]);
  });

  it('deletes only old gymfree caches on activate', async () => {
    const d = deps();
    for (const n of ['gymfree-v1', 'gymfree-v2', 'other-app']) await d.caches.open(n);
    expect(await activate(d)).toEqual(['gymfree-v1']);
    expect(await d.caches.keys()).toEqual(['gymfree-v2', 'other-app']);
  });

  it('chooses a strategy per request', () => {
    const d = deps();
    expect(strategyFor(req('https://gym.example/assets/main.js'), d)).toBe('precached');
    expect(strategyFor(req('https://gym.example/assets/main.js?x=1'), d)).toBe('precached');
    expect(strategyFor(req('https://gym.example/#/plan', { mode: 'navigate' }), d)).toBe('navigate');
    expect(strategyFor(req('https://gym.example/api/storage/vault'), d)).toBe('passthrough');
    expect(strategyFor(req('https://gym.example/assets/main.js', { method: 'POST' }), d)).toBe('passthrough');
    expect(strategyFor(req('https://evil.example/assets/main.js'), d)).toBe('passthrough');
    expect(strategyFor(req('https://gym.example/other/', { mode: 'navigate' }), { ...d, scope: 'https://gym.example/app/' })).toBe('passthrough');
  });

  it('serves precached files from the cache (cache-first)', async () => {
    const d = deps();
    await install(d);
    const res = await handleFetch(req('https://gym.example/exercises/push-up-0.webp'), d);
    expect(await res!.text()).toBe('cached:https://gym.example/exercises/push-up-0.webp');
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('falls back to the network when a precached file is missing', async () => {
    const d = deps();
    const res = await handleFetch(req('https://gym.example/assets/main.js'), d);
    expect(await res!.text()).toBe('network:https://gym.example/assets/main.js');
  });

  it('serves navigations from the network when online and the cached shell when offline', async () => {
    const d = deps();
    await install(d);
    expect(await (await handleFetch(req('https://gym.example/', { mode: 'navigate' }), d))!.text()).toBe('network:https://gym.example/');
    d.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    expect(await (await handleFetch(req('https://gym.example/', { mode: 'navigate' }), d))!.text()).toBe('cached:https://gym.example/index.html');
    d.fetch = vi.fn().mockResolvedValue(new Response('err', { status: 500 }));
    expect(await (await handleFetch(req('https://gym.example/', { mode: 'navigate' }), d))!.text()).toBe('cached:https://gym.example/index.html');
  });

  it('uses the scope root or a 503 when no shell is cached', async () => {
    const d = deps({ fetch: vi.fn().mockRejectedValue(new TypeError('offline')) });
    const res = await handleFetch(req('https://gym.example/', { mode: 'navigate' }), d);
    expect(res!.status).toBe(503);
    const cache = (await d.caches.open('gymfree-v2')) as FakeCache;
    cache.store.set('https://gym.example/', new Response('root'));
    expect(await (await handleFetch(req('https://gym.example/', { mode: 'navigate' }), d))!.text()).toBe('root');
  });

  it('does not intercept passthrough requests', async () => {
    expect(await handleFetch(req('https://gym.example/api/storage/vault'), deps())).toBeNull();
  });
});

describe('InstallManager', () => {
  function fakePrompt(outcome: 'accepted' | 'dismissed') {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = vi.fn(async () => {});
    e.userChoice = Promise.resolve({ outcome });
    return e;
  }

  it('captures the install prompt and replays it on demand', async () => {
    const m = new InstallManager(window);
    const listener = vi.fn();
    const unsubscribe = m.subscribe(listener);
    expect(m.canPrompt).toBe(false);
    expect(await m.prompt()).toBe(false);
    const e = fakePrompt('accepted');
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(m.canPrompt).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await m.prompt()).toBe(true);
    expect(e.prompt).toHaveBeenCalled();
    expect(m.canPrompt).toBe(false);
    window.dispatchEvent(new Event('appinstalled'));
    expect(m.installed).toBe(true);
    unsubscribe();
    window.dispatchEvent(fakePrompt('dismissed'));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('reports a dismissed prompt', async () => {
    const m = new InstallManager(window);
    window.dispatchEvent(fakePrompt('dismissed'));
    expect(await m.prompt()).toBe(false);
  });

  it('detects standalone mode and iOS', () => {
    const win = {
      addEventListener: vi.fn(),
      navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', standalone: false },
      matchMedia: vi.fn(() => ({ matches: true })),
    } as unknown as Window;
    const m = new InstallManager(win);
    expect(m.isIos).toBe(true);
    expect(m.isStandalone).toBe(true);
    const plain = new InstallManager({ addEventListener: vi.fn(), navigator: { userAgent: 'Chrome', standalone: true } } as unknown as Window);
    expect(plain.isStandalone).toBe(true);
    expect(plain.isIos).toBe(false);
    const none = new InstallManager({ addEventListener: vi.fn(), navigator: { userAgent: 'Chrome' } } as unknown as Window);
    expect(none.isStandalone).toBe(false);
  });
});

describe('registerServiceWorker', () => {
  it('registers sw.js at the base path', async () => {
    const register = vi.fn().mockResolvedValue({ scope: '/' });
    expect(await registerServiceWorker({ serviceWorker: { register } } as unknown as Navigator, '/app/')).toEqual({ scope: '/' });
    expect(register).toHaveBeenCalledWith('/app/sw.js', { scope: '/app/' });
  });
  it('is a no-op when unsupported or failing', async () => {
    expect(await registerServiceWorker({} as Navigator)).toBeNull();
    const register = vi.fn().mockRejectedValue(new Error('blocked'));
    expect(await registerServiceWorker({ serviceWorker: { register } } as unknown as Navigator)).toBeNull();
  });
});
