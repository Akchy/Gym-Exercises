/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Builds a strict Content-Security-Policy. Only added to production builds (dev needs inline HMR scripts). */
export function buildCsp(storageUrl?: string): string {
  let connect = "'self'";
  if (storageUrl && /^https:\/\//.test(storageUrl)) connect += ` ${new URL(storageUrl).origin}`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
}

function csp(storageUrl?: string): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${buildCsp(storageUrl)}" />`,
      );
    },
  };
}

/** Files under the public dir, relative and with forward slashes. */
export function listFiles(dir: string, root = dir): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(listFiles(full, root));
    else out.push(relative(root, full).split('\\').join('/'));
  }
  return out;
}

const NOT_PRECACHED = new Set(['sw.js', '_headers', 'icons/maskable.svg']);

/**
 * Injects the precache list and a content-hash version into the service worker so a new
 * deploy invalidates old caches, and users get the whole app (incl. photos) offline.
 */
function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'gymfree-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const sw = bundle['sw.js'];
      if (!sw || sw.type !== 'chunk') return this.error('sw.js was not built');
      const hash = createHash('sha256');
      const files: string[] = [];
      for (const [name, item] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        if (NOT_PRECACHED.has(name) || name.endsWith('.map')) continue;
        files.push(name);
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const name of publicDir ? listFiles(publicDir).sort() : []) {
        if (NOT_PRECACHED.has(name)) continue;
        files.push(name);
        hash.update(name).update(readFileSync(join(publicDir, name)));
      }
      const manifest = ['', ...new Set(files)];
      sw.code = sw.code
        .replace(/(["'`])__PRECACHE_MANIFEST__\1/, JSON.stringify(JSON.stringify(manifest)))
        .replace(/__CACHE_VERSION__/, hash.digest('hex').slice(0, 16));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [csp(env.VITE_STORAGE_URL), serviceWorker()],
    build: {
      target: 'es2022',
      sourcemap: false,
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: { main: resolve(__dirname, 'index.html'), sw: resolve(__dirname, 'src/sw.ts') },
        output: {
          // The service worker must keep a stable URL; everything else is content-hashed.
          entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['tests/unit/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/main.ts', 'src/sw.ts', 'src/vite-env.d.ts'],
        reporter: ['text', 'html'],
      },
    },
  };
});
