// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { basePath, buildCsp, listFiles } from '../../vite.config';

describe('build helpers', () => {
  it('normalises the base path (root by default, subfolder for GitHub Pages)', () => {
    expect(basePath(undefined)).toBe('/');
    expect(basePath('')).toBe('/');
    expect(basePath('/')).toBe('/');
    expect(basePath('/Gym-Exercises')).toBe('/Gym-Exercises/');
    expect(basePath('Gym-Exercises/')).toBe('/Gym-Exercises/');
  });

  it('builds a strict CSP and allows an https storage origin', () => {
    const csp = buildCsp();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self';");
    expect(buildCsp('https://api.example.com/v1/storage')).toContain("connect-src 'self' https://api.example.com;");
    expect(buildCsp('/api/storage')).toContain("connect-src 'self';");
  });

  it('lists public files recursively with forward slashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pub-'));
    mkdirSync(join(dir, 'icons'));
    writeFileSync(join(dir, 'a.txt'), 'a');
    writeFileSync(join(dir, 'icons', 'b.png'), 'b');
    expect(listFiles(dir).sort()).toEqual(['a.txt', 'icons/b.png']);
  });
});
