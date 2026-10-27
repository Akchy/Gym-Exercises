import { beforeEach, describe, expect, it } from 'vitest';
import { DeviceStore } from '../../src/core/store';
import { decide, Repository } from '../../src/core/sync';
import type { AppState } from '../../src/core/types';
import { ALEX, FakeCloud } from './fake-cloud';
import { onboardedState } from './helpers';

const T0 = Date.parse('2026-10-27T10:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

let store: DeviceStore;
let cloud: FakeCloud;
let clock: number;

function repo(withCloud = true) {
  return new Repository(store, withCloud ? cloud : null, { now: () => new Date(T0 + (clock += 1000)) });
}

function named(name: string): AppState {
  const s = onboardedState();
  s.profile.name = name;
  return s;
}

beforeEach(() => {
  localStorage.clear();
  store = new DeviceStore(localStorage);
  cloud = new FakeCloud();
  clock = 0;
});

describe('decide', () => {
  const dev = (s: number, dirty = false) => ({ state: named('d'), updatedAt: at(s), dirty });
  const cl = (s: number) => ({ state: named('c'), updatedAt: at(s) });
  it.each([
    ['nothing anywhere', null, null, 'none'],
    ['only the cloud', null, cl(1), 'use-cloud'],
    ['only the device', dev(1), null, 'upload-device'],
    ['cloud newer', dev(1, true), cl(2), 'use-cloud'],
    ['device newer', dev(2), cl(1), 'upload-device'],
    ['same time, uploaded', dev(1), cl(1), 'in-sync'],
    ['same time, waiting', dev(1, true), cl(1), 'upload-device'],
  ] as const)('%s', (_, d, c, expected) => expect(decide(d, c)).toBe(expected));
});

describe('Repository: start', () => {
  it('without Supabase settings goes straight to local mode', async () => {
    const r = repo(false);
    expect(r.cloudEnabled).toBe(false);
    const res = await r.start();
    expect(res.kind).toBe('ready');
    expect(r.mode).toBe('local');
  });

  it('shows the welcome screen until the user chooses', async () => {
    expect((await repo().start()).kind).toBe('welcome');
    store.setMode('local');
    store.write('local', { state: named('Jo'), updatedAt: at(1), dirty: false });
    const res = await repo().start();
    expect(res.kind === 'ready' && res.state.profile.name).toBe('Jo');
  });

  it('opens a signed-in device from its cache, then pull() brings newer cloud data', async () => {
    cloud.user = ALEX;
    store.write({ user: ALEX.id }, { state: named('Old'), updatedAt: at(1), dirty: false });
    cloud.rows.set(ALEX.id, { data: named('New'), updatedAt: at(50) });
    const r = repo();
    const res = await r.start();
    expect(res.kind === 'ready' && res.state.profile.name).toBe('Old');
    expect(r.mode).toBe('cloud');
    expect((await r.pull())?.profile.name).toBe('New');
    expect(store.read({ user: ALEX.id })?.state.profile.name).toBe('New');
    expect(r.status).toBe('synced');
  });

  it('on a new device waits for the account data', async () => {
    cloud.user = ALEX;
    cloud.rows.set(ALEX.id, { data: named('Cloud'), updatedAt: at(5) });
    const res = await repo().start();
    expect(res.kind === 'ready' && res.state.profile.name).toBe('Cloud');
  });

  it('starts offline from the remembered user without signing out', async () => {
    store.rememberUser(ALEX);
    store.write({ user: ALEX.id }, { state: named('Cached'), updatedAt: at(1), dirty: true });
    cloud.offline = true;
    const r = repo();
    const res = await r.start();
    expect(res.kind === 'ready' && res.state.profile.name).toBe('Cached');
    expect(r.user).toEqual(ALEX);
    expect(r.status).toBe('offline');
    expect(await r.pull()).toBeNull();
  });

  it('uploads device data when signing in to an empty account', async () => {
    store.setMode('local');
    store.write('local', { state: named('Local'), updatedAt: at(1), dirty: false });
    cloud.user = ALEX;
    const r = repo();
    const res = await r.start();
    expect(res.kind === 'ready' && res.state.profile.name).toBe('Local');
    expect((cloud.rows.get(ALEX.id)?.data as AppState).profile.name).toBe('Local');
    expect(store.read('local')).toBeNull();
    expect(r.hasPendingChanges()).toBe(false);
  });

  it('asks which data to keep when both have data', async () => {
    const setup = () => {
      store.write('local', { state: named('Local'), updatedAt: at(1), dirty: false });
      cloud.user = ALEX;
      cloud.rows.set(ALEX.id, { data: named('Account'), updatedAt: at(2) });
    };
    setup();
    let r = repo();
    let res = await r.start();
    expect(res.kind).toBe('link');
    expect((await r.resolveLink('account')).profile.name).toBe('Account');
    expect(store.read('local')).toBeNull();
    expect(cloud.saves).toEqual([]);

    localStorage.clear();
    setup();
    r = repo();
    res = await r.start();
    expect(res.kind === 'link' && res.device.profile.name).toBe('Local');
    expect((await r.resolveLink('device')).profile.name).toBe('Local');
    expect((cloud.rows.get(ALEX.id)?.data as AppState).profile.name).toBe('Local');
    await expect(r.resolveLink('device')).rejects.toThrow('Nothing to resolve');
  });

  it('keeps local mode if the account cannot be reached while linking', async () => {
    store.write('local', { state: named('Local'), updatedAt: at(1), dirty: false });
    cloud.user = ALEX;
    const r = repo();
    cloud.fetch = async () => {
      throw new Error('Failed to fetch');
    };
    const res = await r.start();
    expect(res.kind === 'ready' && res.state.profile.name).toBe('Local');
    expect(r.mode).toBe('local');
    expect(store.read('local')).not.toBeNull();
  });

  it('ignores a malformed cloud row and replaces it with the device copy', async () => {
    cloud.user = ALEX;
    store.write({ user: ALEX.id }, { state: named('Good'), updatedAt: at(1), dirty: false });
    cloud.rows.set(ALEX.id, { data: { version: 1, plan: 'oops' }, updatedAt: 'not a date' });
    const r = repo();
    await r.start();
    expect(await r.pull()).toBeNull();
    expect((cloud.rows.get(ALEX.id)?.data as AppState).profile.name).toBe('Good');
  });
});

describe('Repository: saving and syncing', () => {
  it('saves locally in local mode', async () => {
    const r = repo();
    r.chooseLocal();
    r.save(named('Jo'));
    expect(store.read('local')).toMatchObject({ dirty: false, state: { profile: { name: 'Jo' } } });
    expect(r.status).toBe('local');
  });

  it('uploads in the background and clears the waiting flag', async () => {
    cloud.user = ALEX;
    const r = repo();
    await r.start();
    const statuses: string[] = [];
    r.onStatus((s) => statuses.push(s));
    r.save(named('A'));
    expect(r.hasPendingChanges()).toBe(true);
    await r.idle();
    expect(r.hasPendingChanges()).toBe(false);
    expect(statuses).toEqual(['saving', 'synced']);
    expect((cloud.rows.get(ALEX.id)?.data as AppState).profile.name).toBe('A');
  });

  it('keeps changes waiting while offline and uploads them on the next try', async () => {
    cloud.user = ALEX;
    const r = repo();
    await r.start();
    cloud.offline = true;
    r.save(named('Offline edit'));
    await r.idle();
    expect(r.status).toBe('offline');
    expect(r.hasPendingChanges()).toBe(true);
    cloud.offline = false;
    await r.upload();
    expect(r.status).toBe('synced');
    expect(r.hasPendingChanges()).toBe(false);
    expect((cloud.rows.get(ALEX.id)?.data as AppState).profile.name).toBe('Offline edit');
  });

  it('uploads the latest version when saves overlap', async () => {
    cloud.user = ALEX;
    const r = repo();
    await r.start();
    r.save(named('1'));
    r.save(named('2'));
    r.save(named('3'));
    await r.idle();
    expect((cloud.rows.get(ALEX.id)?.data as AppState).profile.name).toBe('3');
    expect(r.hasPendingChanges()).toBe(false);
  });
});

describe('Repository: sign out and delete', () => {
  it('signs out and removes the device copy', async () => {
    cloud.user = ALEX;
    const r = repo();
    await r.start();
    r.save(named('A'));
    await r.idle();
    await r.signOut();
    expect(cloud.user).toBeNull();
    expect(store.read({ user: ALEX.id })).toBeNull();
    expect(store.rememberedUser()).toBeNull();
    expect(store.mode()).toBeNull();
    expect((await repo().start()).kind).toBe('welcome');
  });

  it('deletes the account row and the device copy', async () => {
    cloud.user = ALEX;
    const r = repo();
    await r.start();
    r.save(named('A'));
    await r.deleteAll();
    expect(cloud.rows.has(ALEX.id)).toBe(false);
    expect(store.read({ user: ALEX.id })).toBeNull();
    expect(r.mode).toBeNull();
  });

  it('refuses to delete account data while offline (nothing is removed)', async () => {
    cloud.user = ALEX;
    const r = repo();
    await r.start();
    r.save(named('A'));
    await r.idle();
    cloud.offline = true;
    await expect(r.deleteAll()).rejects.toThrow();
    expect(cloud.rows.has(ALEX.id)).toBe(true);
    expect(store.read({ user: ALEX.id })).not.toBeNull();
  });

  it('deletes local-mode data', async () => {
    const r = repo();
    r.chooseLocal();
    r.save(named('A'));
    await r.deleteAll();
    expect(store.read('local')).toBeNull();
    expect(store.mode()).toBeNull();
  });
});
