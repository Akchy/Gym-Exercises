import { describe, expect, it, vi } from 'vitest';
import {
  HttpStorageAdapter,
  LocalStorageAdapter,
  MemoryStorageAdapter,
  SupabaseStorageAdapter,
} from '../../src/core/storage';
import { createStorage } from '../../src/core/config';

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe('MemoryStorageAdapter', () => {
  it('stores, reads and removes', async () => {
    const s = new MemoryStorageAdapter();
    expect(await s.getItem('a')).toBeNull();
    await s.setItem('a', '1');
    expect(await s.getItem('a')).toBe('1');
    await s.removeItem('a');
    expect(await s.getItem('a')).toBeNull();
  });
});

describe('LocalStorageAdapter', () => {
  it('prefixes keys in localStorage', async () => {
    localStorage.clear();
    const s = new LocalStorageAdapter(localStorage, 'p:');
    await s.setItem('vault', 'x');
    expect(localStorage.getItem('p:vault')).toBe('x');
    expect(await s.getItem('vault')).toBe('x');
    await s.removeItem('vault');
    expect(localStorage.getItem('p:vault')).toBeNull();
  });

  it('wraps quota errors with a friendly message', async () => {
    const broken = { setItem: () => { throw new Error('QuotaExceeded'); } } as unknown as Storage;
    await expect(new LocalStorageAdapter(broken).setItem('k', 'v')).rejects.toThrow('Could not save data');
  });
});

describe('HttpStorageAdapter', () => {
  it('requires https or a same-origin path', () => {
    expect(() => new HttpStorageAdapter('http://evil.example.com')).toThrow('https');
    expect(() => new HttpStorageAdapter('https://api.example.com')).not.toThrow();
    expect(() => new HttpStorageAdapter('/api/storage')).not.toThrow();
    expect(() => new HttpStorageAdapter('http://localhost:8080')).not.toThrow();
    expect(() => new HttpStorageAdapter('//evil.example.com')).toThrow();
  });

  it('GETs, PUTs and DELETEs with a bearer token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(200, { value: 'cipher' }))
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(204));
    const s = new HttpStorageAdapter('https://api.example.com/v1/', () => 'tok', fetchImpl);
    expect(await s.getItem('vault')).toBe('cipher');
    await s.setItem('vault', 'new');
    await s.removeItem('vault');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.com/v1/vault');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ value: 'new' }) });
    expect(fetchImpl.mock.calls[2][1].method).toBe('DELETE');
  });

  it('omits Authorization when there is no token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(404));
    const s = new HttpStorageAdapter('/api/storage', () => null, fetchImpl);
    expect(await s.getItem('vault')).toBeNull();
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('handles errors and odd bodies', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(200, { value: 5 }))
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(500));
    const s = new HttpStorageAdapter('/api', undefined, fetchImpl);
    await expect(s.getItem('vault')).rejects.toThrow('500');
    expect(await s.getItem('vault')).toBeNull();
    await expect(s.setItem('vault', 'x')).rejects.toThrow('500');
    await expect(s.removeItem('vault')).resolves.toBeUndefined();
    await expect(s.removeItem('vault')).rejects.toThrow('500');
  });

  it('rejects unsafe keys (no path traversal)', async () => {
    const s = new HttpStorageAdapter('/api', undefined, vi.fn());
    await expect(s.getItem('../admin')).rejects.toThrow('Invalid storage key');
    await expect(s.setItem('a/b', 'x')).rejects.toThrow('Invalid storage key');
    await expect(s.removeItem('')).rejects.toThrow('Invalid storage key');
  });
});

describe('SupabaseStorageAdapter', () => {
  const make = (fetchImpl = vi.fn(), token: string | null = 'jwt') =>
    new SupabaseStorageAdapter('https://abc.supabase.co/', 'anon', () => token, fetchImpl);

  it('validates configuration', () => {
    expect(() => new SupabaseStorageAdapter('http://abc.supabase.co', 'anon', () => 't')).toThrow('https');
    expect(() => new SupabaseStorageAdapter('https://abc.supabase.co', '', () => 't')).toThrow('anon key');
  });

  it('reads, upserts and deletes rows', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(200, [{ value: 'cipher' }]))
      .mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(201))
      .mockResolvedValueOnce(response(204));
    const s = make(fetchImpl);
    expect(await s.getItem('vault')).toBe('cipher');
    expect(await s.getItem('vault')).toBeNull();
    await s.setItem('vault', 'c2');
    await s.removeItem('vault');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://abc.supabase.co/rest/v1/vault_items?key=eq.vault&select=value');
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer jwt' });
    expect(fetchImpl.mock.calls[2][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ key: 'vault', value: 'c2' }) });
    expect(fetchImpl.mock.calls[2][1].headers.Prefer).toContain('merge-duplicates');
    expect(fetchImpl.mock.calls[3][1].method).toBe('DELETE');
  });

  it('requires a signed-in user', async () => {
    await expect(make(vi.fn(), null).getItem('vault')).rejects.toThrow('Not signed in');
  });

  it('surfaces HTTP errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(401));
    const s = make(fetchImpl);
    await expect(s.getItem('vault')).rejects.toThrow('401');
    await expect(s.setItem('vault', 'x')).rejects.toThrow('401');
    await expect(s.removeItem('vault')).rejects.toThrow('401');
  });
});

describe('createStorage', () => {
  it('defaults to localStorage', () => {
    expect(createStorage({})).toBeInstanceOf(LocalStorageAdapter);
    expect(createStorage({ VITE_STORAGE_BACKEND: 'LOCAL' })).toBeInstanceOf(LocalStorageAdapter);
  });
  it('supports an http backend', () => {
    expect(createStorage({ VITE_STORAGE_BACKEND: 'http', VITE_STORAGE_URL: '/api/storage' })).toBeInstanceOf(HttpStorageAdapter);
    expect(() => createStorage({ VITE_STORAGE_BACKEND: 'http' })).toThrow('VITE_STORAGE_URL');
  });
  it('rejects unknown backends', () => {
    expect(() => createStorage({ VITE_STORAGE_BACKEND: 'ftp' })).toThrow('Unknown storage backend');
  });
});
