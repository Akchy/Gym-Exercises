/// <reference types="vitest/config" />
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [csp(env.VITE_STORAGE_URL)],
    build: {
      target: 'es2022',
      sourcemap: false,
      modulePreload: { polyfill: false },
    },
    test: {
      environment: 'jsdom',
      include: ['tests/unit/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/main.ts', 'src/vite-env.d.ts'],
        reporter: ['text', 'html'],
      },
    },
  };
});
