import { describe, expect, it, vi } from 'vitest';
import { cloudFromEnv, createSupabaseCloud } from '../../src/core/cloud';
import { DeviceStore } from '../../src/core/store';
import { onboardedState } from './helpers';

describe('DeviceStore', () => {
  it('round-trips records under readable keys', () => {
    localStorage.clear();
    const store = new DeviceStore(localStorage);
    const record = { state: onboardedState(), updatedAt: '2026-10-27T10:00:00.000Z', dirty: true, base: '2026-10-27T09:00:00.000Z' };
    store.write('local', record);
    store.write({ user: 'u1' }, { ...record, dirty: false });
    expect(Object.keys(localStorage).sort()).toEqual(['gymx:cache:u1', 'gymx:local']);
    expect(store.read('local')).toEqual(record);
    expect(store.read({ user: 'u1' })?.dirty).toBe(false);
    store.remove('local');
    expect(store.read('local')).toBeNull();
  });

  it('reads records saved before the sync base was tracked', () => {
    localStorage.clear();
    localStorage.setItem('gymx:cache:u1', JSON.stringify({ state: onboardedState(), updatedAt: '2026-10-27T10:00:00.000Z', dirty: false }));
    expect(new DeviceStore(localStorage).read({ user: 'u1' })?.base).toBeNull();
  });

  it('keeps unsaved workout drafts per day and clears them', () => {
    localStorage.clear();
    const store = new DeviceStore(localStorage);
    expect(store.drafts()).toEqual({});
    store.setDraft('day-1', { a: 1 });
    store.setDraft('free', { b: 2 });
    expect(store.drafts()).toEqual({ 'day-1': { a: 1 }, free: { b: 2 } });
    store.setDraft('day-1', null);
    expect(store.drafts()).toEqual({ free: { b: 2 } });
    store.setDraft('free', null);
    expect(localStorage.getItem('gymx:drafts')).toBeNull();
    store.setDraft('x', { c: 3 });
    store.clearDrafts();
    expect(store.drafts()).toEqual({});
    localStorage.setItem('gymx:drafts', '[1,2]');
    expect(store.drafts()).toEqual({});
  });

  it('returns null for missing, corrupt or invalid records', () => {
    localStorage.clear();
    const store = new DeviceStore(localStorage);
    expect(store.read('local')).toBeNull();
    localStorage.setItem('gymx:local', '{not json');
    expect(store.read('local')).toBeNull();
    localStorage.setItem('gymx:local', JSON.stringify({ state: { version: 99 }, updatedAt: '2026-10-27T10:00:00Z' }));
    expect(store.read('local')).toBeNull();
    localStorage.setItem('gymx:local', JSON.stringify({ state: onboardedState(), updatedAt: 'yesterday' }));
    expect(store.read('local')).toBeNull();
  });

  it('remembers the mode and the last signed-in user', () => {
    localStorage.clear();
    const store = new DeviceStore(localStorage);
    expect(store.mode()).toBeNull();
    store.setMode('cloud');
    expect(store.mode()).toBe('cloud');
    store.setMode(null);
    expect(localStorage.getItem('gymx:mode')).toBeNull();
    expect(store.rememberedUser()).toBeNull();
    store.rememberUser({ id: 'u1', email: 'a@b.c' });
    expect(store.rememberedUser()).toEqual({ id: 'u1', email: 'a@b.c' });
    localStorage.setItem('gymx:user', '{"email":"x"}');
    expect(store.rememberedUser()).toBeNull();
    store.rememberUser(null);
    expect(localStorage.getItem('gymx:user')).toBeNull();
  });

  it('reports a full or blocked storage clearly', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    } as unknown as Storage;
    expect(() => new DeviceStore(broken).setMode('local')).toThrow('Could not save on this device');
  });
});

describe('cloud config', () => {
  it('is off unless both Supabase variables are set', () => {
    const create = vi.fn(() => ({}) as never);
    expect(cloudFromEnv({}, '/', create)).toBeNull();
    expect(cloudFromEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co' }, '/', create)).toBeNull();
    expect(cloudFromEnv({ VITE_SUPABASE_URL: ' https://x.supabase.co ', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' }, 'https://site/', create)).not.toBeNull();
    expect(create).toHaveBeenCalledWith('https://x.supabase.co', 'k', 'https://site/');
  });

  it('requires https for the Supabase URL', () => {
    expect(() => createSupabaseCloud('http://x.supabase.co', 'k', '/')).toThrow('https');
  });
});
