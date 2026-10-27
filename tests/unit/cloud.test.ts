import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardedState } from './helpers';

// A stand-in for the Supabase client: records calls and returns canned results.
const calls: unknown[][] = [];
let result: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const query = () => {
  const q: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'upsert', 'delete', 'maybeSingle']) {
    q[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return q;
    };
  }
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
};
const client = {
  auth: {
    getSession: vi.fn(async () => result),
    signInWithOAuth: vi.fn(async () => result),
    signOut: vi.fn(async () => result),
  },
  from: vi.fn((table: string) => {
    calls.push(['from', table]);
    return query();
  }),
};
const createClient = vi.fn((..._args: unknown[]) => client);
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

const { createSupabaseCloud } = await import('../../src/core/cloud');

beforeEach(() => {
  calls.length = 0;
  result = { data: null, error: null };
});

describe('createSupabaseCloud', () => {
  const cloud = () => createSupabaseCloud('https://p.supabase.co', 'sb_publishable_x', 'https://site/Gym-Exercises/');

  it('uses PKCE and keeps the session on the device', () => {
    cloud();
    expect(createClient).toHaveBeenLastCalledWith('https://p.supabase.co', 'sb_publishable_x', {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  });

  it('refuses a secret key', () => {
    expect(() => createSupabaseCloud('https://p.supabase.co', 'sb_secret_abc', '/')).toThrow('publishable key');
  });

  it('reads the signed-in user', async () => {
    result = { data: { session: { user: { id: 'u1', email: 'a@b.c' } } }, error: null };
    expect(await cloud().currentUser()).toEqual({ id: 'u1', email: 'a@b.c' });
    result = { data: { session: { user: { id: 'u1' } } }, error: null };
    expect(await cloud().currentUser()).toEqual({ id: 'u1', email: null });
    result = { data: { session: null }, error: null };
    expect(await cloud().currentUser()).toBeNull();
    result = { data: { session: null }, error: { message: 'Failed to fetch' } };
    await expect(cloud().currentUser()).rejects.toThrow('Failed to fetch');
  });

  it('signs in with Google back to the app, and signs out this device only', async () => {
    await cloud().signInWithGoogle();
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://site/Gym-Exercises/' } });
    await cloud().signOut();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it("reads, saves and deletes the user's row in user_data", async () => {
    result = { data: { data: { version: 1 }, updated_at: '2026-10-27T10:00:00+00:00' }, error: null };
    expect(await cloud().fetch('u1')).toEqual({ data: { version: 1 }, updatedAt: '2026-10-27T10:00:00+00:00' });
    expect(calls).toEqual([['from', 'user_data'], ['select', 'data, updated_at'], ['eq', 'user_id', 'u1'], ['maybeSingle']]);

    result = { data: null, error: null };
    expect(await cloud().fetch('u1')).toBeNull();

    calls.length = 0;
    const state = onboardedState();
    await cloud().save('u1', state, '2026-10-27T11:00:00.000Z');
    expect(calls).toEqual([['from', 'user_data'], ['upsert', { user_id: 'u1', data: state, updated_at: '2026-10-27T11:00:00.000Z' }]]);

    calls.length = 0;
    await cloud().remove('u1');
    expect(calls).toEqual([['from', 'user_data'], ['delete'], ['eq', 'user_id', 'u1']]);
  });

  it('turns Supabase errors into exceptions', async () => {
    result = { data: null, error: { message: 'permission denied' } };
    await expect(cloud().fetch('u1')).rejects.toThrow('permission denied');
    await expect(cloud().save('u1', onboardedState(), 'x')).rejects.toThrow('permission denied');
    await expect(cloud().remove('u1')).rejects.toThrow('permission denied');
    await expect(cloud().signInWithGoogle()).rejects.toThrow('permission denied');
  });
});
