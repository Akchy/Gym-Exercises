/// <reference lib="webworker" />
/* Service worker entry. The build replaces the two placeholders (see vite.config.ts). */
import { activate, handleFetch, install, strategyFor, type SwDeps } from './pwa/sw-core';

declare const self: ServiceWorkerGlobalScope;

const deps: SwDeps = {
  caches: self.caches as unknown as SwDeps['caches'],
  fetch: (r, init) => fetch(r, init),
  scope: self.registration.scope,
  version: '__CACHE_VERSION__',
  manifest: JSON.parse('__PRECACHE_MANIFEST__') as string[],
};

self.addEventListener('install', (event) => {
  event.waitUntil(install(deps).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activate(deps).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (strategyFor(event.request, deps) === 'passthrough') return;
  event.respondWith(handleFetch(event.request, deps).then((res) => res ?? fetch(event.request)));
});
