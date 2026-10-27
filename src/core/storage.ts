/**
 * Pluggable persistence. Every adapter stores opaque strings; the Vault only ever hands
 * them encrypted envelopes, so any backend (browser, Supabase, self-hosted API on
 * AWS/Azure) stores ciphertext only.
 */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  async setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}

/** Browser localStorage (default: zero-config, works on any static host). */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(
    private readonly storage: Storage = globalThis.localStorage,
    private readonly prefix = 'gymx:',
  ) {}
  async getItem(key: string) {
    return this.storage.getItem(this.prefix + key);
  }
  async setItem(key: string, value: string) {
    try {
      this.storage.setItem(this.prefix + key, value);
    } catch (err) {
      throw new Error(`Could not save data (storage full or blocked): ${(err as Error).message}`);
    }
  }
  async removeItem(key: string) {
    this.storage.removeItem(this.prefix + key);
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type TokenProvider = () => Promise<string | null> | string | null;

function assertSafeKey(key: string) {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) throw new Error(`Invalid storage key: ${key}`);
}

/**
 * Generic REST backend for closed/self-hosted deployments (AWS API Gateway + Lambda,
 * Azure Functions, any server). Contract:
 *   GET    {baseUrl}/{key} -> 200 {"value": string} | 404
 *   PUT    {baseUrl}/{key}    body {"value": string}
 *   DELETE {baseUrl}/{key}
 * The server must scope keys to the authenticated user.
 */
export class HttpStorageAdapter implements StorageAdapter {
  private readonly baseUrl: string;
  constructor(
    baseUrl: string,
    private readonly getToken: TokenProvider = () => null,
    private readonly fetchImpl: FetchLike = (i, init) => fetch(i, init),
  ) {
    // Same-origin paths ("/api/storage") suit closed deployments behind an SSO proxy,
    // where the session cookie identifies the user.
    const sameOrigin = /^\/[^/]/.test(baseUrl);
    if (!sameOrigin && !/^https:\/\//.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(baseUrl + '/')) {
      throw new Error('HttpStorageAdapter requires an https:// URL or a same-origin path');
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }
  private async headers(): Promise<Record<string, string>> {
    const token = await this.getToken();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }
  async getItem(key: string) {
    assertSafeKey(key);
    const res = await this.fetchImpl(`${this.baseUrl}/${key}`, { method: 'GET', headers: await this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage request failed (${res.status})`);
    const body = (await res.json()) as { value?: unknown };
    return typeof body.value === 'string' ? body.value : null;
  }
  async setItem(key: string, value: string) {
    assertSafeKey(key);
    const res = await this.fetchImpl(`${this.baseUrl}/${key}`, {
      method: 'PUT',
      headers: await this.headers(),
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error(`Storage request failed (${res.status})`);
  }
  async removeItem(key: string) {
    assertSafeKey(key);
    const res = await this.fetchImpl(`${this.baseUrl}/${key}`, { method: 'DELETE', headers: await this.headers() });
    if (!res.ok && res.status !== 404) throw new Error(`Storage request failed (${res.status})`);
  }
}

/**
 * Supabase (PostgREST) backend without the SDK. Uses table `vault_items`
 * (see deploy/supabase/schema.sql) protected by Row Level Security so each
 * authenticated user can only touch their own rows.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly url: string;
  constructor(
    projectUrl: string,
    private readonly anonKey: string,
    private readonly getAccessToken: TokenProvider,
    private readonly fetchImpl: FetchLike = (i, init) => fetch(i, init),
    table = 'vault_items',
  ) {
    if (!/^https:\/\//.test(projectUrl)) throw new Error('Supabase URL must use https://');
    if (!anonKey) throw new Error('Supabase anon key is required');
    this.url = `${projectUrl.replace(/\/+$/, '')}/rest/v1/${table}`;
  }
  private async headers(extra: Record<string, string> = {}) {
    const token = await this.getAccessToken();
    if (!token) throw new Error('Not signed in to Supabase');
    return { apikey: this.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
  }
  async getItem(key: string) {
    assertSafeKey(key);
    const res = await this.fetchImpl(`${this.url}?key=eq.${encodeURIComponent(key)}&select=value`, {
      method: 'GET',
      headers: await this.headers(),
    });
    if (!res.ok) throw new Error(`Supabase request failed (${res.status})`);
    const rows = (await res.json()) as Array<{ value: string }>;
    return rows.length ? rows[0].value : null;
  }
  async setItem(key: string, value: string) {
    assertSafeKey(key);
    const res = await this.fetchImpl(`${this.url}?on_conflict=user_id,key`, {
      method: 'POST',
      headers: await this.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) throw new Error(`Supabase request failed (${res.status})`);
  }
  async removeItem(key: string) {
    assertSafeKey(key);
    const res = await this.fetchImpl(`${this.url}?key=eq.${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: await this.headers(),
    });
    if (!res.ok) throw new Error(`Supabase request failed (${res.status})`);
  }
}
