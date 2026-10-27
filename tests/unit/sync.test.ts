import { beforeEach, describe, expect, it } from 'vitest';
import { DeviceStore } from '../../src/core/store';
import { Repository } from '../../src/core/sync';
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

/** A second device: its own storage, same account and clock. */
function otherDevice() {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } as unknown as Storage;
  return new Repository(new DeviceStore(storage), cloud, { now: () => new Date(T0 + (clock += 1000)) });
}

const workout = (id: string) => ({ id, date: '2026-10-27', dayId: null, entries: [{ exerciseId: 'push-up', sets: [{ reps: 10, weightKg: 0 }] }], durationMin: null, notes: '' });
const cloudState = () => cloud.rows.get(ALEX.id)!.data as AppState;

describe('Repository: two devices', () => {
  beforeEach(() => {
    cloud.user = ALEX;
    cloud.rows.set(ALEX.id, { data: named('Alex'), updatedAt: at(0) });
  });

  it("a device left open doesn't wipe out another device's workout", async () => {
    const pc = repo();
    const pcState = ((await pc.start()) as { state: AppState }).state;
    const merges: AppState[] = [];
    pc.onData((s) => merges.push(s));
    const phone = otherDevice();
    const phoneState = ((await phone.start()) as { state: AppState }).state;

    phoneState.workouts.push(workout('from-phone'));
    phone.save(phoneState);
    await phone.idle();
    pcState.settings.units = 'lb'; // the PC never re-synced, then changes a setting
    pc.save(pcState);
    await pc.idle();

    expect(cloudState().workouts.map((w) => w.id)).toEqual(['from-phone']);
    expect(cloudState().settings.units).toBe('lb');
    expect(merges.at(-1)?.workouts.map((w) => w.id)).toEqual(['from-phone']); // the PC shows it too
    expect((await phone.pull())?.settings.units).toBe('lb');
    expect(pc.status).toBe('synced');
  });

  it('keeps changes made on both devices while offline', async () => {
    const a = repo();
    const aState = ((await a.start()) as { state: AppState }).state;
    const b = otherDevice();
    const bState = ((await b.start()) as { state: AppState }).state;
    cloud.offline = true;
    aState.workouts.push(workout('a'));
    a.save(aState);
    bState.workouts.push(workout('b'));
    b.save(bState);
    await Promise.all([a.idle(), b.idle()]);
    cloud.offline = false;
    await a.pull();
    const merged = await b.pull();
    expect(merged?.workouts.map((w) => w.id).sort()).toEqual(['a', 'b']);
    expect(cloudState().workouts.map((w) => w.id).sort()).toEqual(['a', 'b']);
  });

  it('a workout deleted on one device stays deleted', async () => {
    const start = named('Alex');
    start.workouts = [workout('w1')];
    cloud.rows.set(ALEX.id, { data: start, updatedAt: at(0) });
    const a = repo();
    const aState = ((await a.start()) as { state: AppState }).state;
    const b = otherDevice();
    const bState = ((await b.start()) as { state: AppState }).state;
    aState.workouts = [];
    aState.deletedWorkoutIds = ['w1'];
    a.save(aState);
    await a.idle();
    bState.settings.animations = false; // b still has w1 and saves something else
    b.save(bState);
    await b.idle();
    expect(cloudState().workouts).toEqual([]);
    expect(cloudState().settings.animations).toBe(false);
  });

  it('gives up (keeping the changes) if another device keeps saving at the same moment', async () => {
    const r = repo();
    const state = ((await r.start()) as { state: AppState }).state;
    cloud.save = async () => false; // every save loses the race
    r.save(state);
    await r.idle();
    expect(r.status).toBe('error');
    expect(r.lastError).toMatch(/keeps saving/);
    expect(r.hasPendingChanges()).toBe(true);
  });
});

describe('Repository: failed saves', () => {
  beforeEach(() => (cloud.user = ALEX));

  it('says "offline" when the server cannot be reached', async () => {
    const r = repo();
    await r.start();
    cloud.offline = true;
    r.save(named('A'));
    await r.idle();
    expect(r.status).toBe('offline');
    expect(r.lastError).toBeNull();
  });

  it('reports a refused save with its reason, keeps the change and retries later', async () => {
    const r = repo();
    await r.start();
    cloud.reject = 'new row violates row-level security policy for table "user_data"';
    r.save(named('A'));
    await r.idle();
    expect(r.status).toBe('error');
    expect(r.lastError).toBe('new row violates row-level security policy for table "user_data"');
    expect(r.hasPendingChanges()).toBe(true);
    expect(await r.pull()).toBeNull();
    expect(r.status).toBe('error');
    cloud.reject = null;
    await r.upload();
    expect(r.status).toBe('synced');
    expect(r.lastError).toBeNull();
    expect(cloudState().profile.name).toBe('A');
  });
});

describe('Repository: drafts', () => {
  it('stores, reads and discards workout drafts; signing out clears them', async () => {
    cloud.user = ALEX;
    const r = repo();
    await r.start();
    expect(r.hasDraft('day-1')).toBe(false);
    r.setDraft('day-1', { entries: [] });
    expect(r.draft('day-1')).toEqual({ entries: [] });
    r.setDraft('day-1', null);
    expect(r.hasDraft('day-1')).toBe(false);
    r.setDraft('day-1', { entries: [] });
    await r.signOut();
    expect(r.hasDraft('day-1')).toBe(false);
  });
});

describe('Repository: start', () => {
  it('without Supabase settings shows the landing page with sign-in unavailable', async () => {
    const r = repo(false);
    expect(r.cloudEnabled).toBe(false);
    expect((await r.start()).kind).toBe('welcome');
    expect(r.signInAvailable).toBe(false);
    r.chooseLocal();
    expect((await repo(false).start()).kind).toBe('ready'); // the choice is remembered
  });

  it('marks sign-in unavailable when Supabase cannot be reached', async () => {
    cloud.offline = true;
    const r = repo();
    expect(r.signInAvailable).toBe(true);
    expect((await r.start()).kind).toBe('welcome');
    expect(r.signInAvailable).toBe(false);
  });

  it('shows the welcome screen until the user chooses', async () => {
    expect((await repo().start()).kind).toBe('welcome');
    store.setMode('local');
    store.write('local', { state: named('Jo'), updatedAt: at(1), dirty: false, base: null });
    const res = await repo().start();
    expect(res.kind === 'ready' && res.state.profile.name).toBe('Jo');
  });

  it('opens a signed-in device from its cache, then pull() brings newer cloud data', async () => {
    cloud.user = ALEX;
    store.write({ user: ALEX.id }, { state: named('Old'), updatedAt: at(1), dirty: false, base: null });
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
    store.write({ user: ALEX.id }, { state: named('Cached'), updatedAt: at(1), dirty: true, base: null });
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
    store.write('local', { state: named('Local'), updatedAt: at(1), dirty: false, base: null });
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
      store.write('local', { state: named('Local'), updatedAt: at(1), dirty: false, base: null });
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
    store.write('local', { state: named('Local'), updatedAt: at(1), dirty: false, base: null });
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
    store.write({ user: ALEX.id }, { state: named('Good'), updatedAt: at(1), dirty: false, base: null });
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

describe('Repository: slow or hanging server', () => {
  const never = () => new Promise<never>(() => {});
  const quick = () => new Repository(store, cloud, { now: () => new Date(T0 + (clock += 1000)), launchTimeoutMs: 20, requestTimeoutMs: 20 });

  it('opens the landing page (sign-in unavailable) if the launch check hangs', async () => {
    cloud.currentUser = never;
    const r = quick();
    expect((await r.start()).kind).toBe('welcome');
    expect(r.signInAvailable).toBe(false);
  });

  it('opens from the saved copy if the launch check hangs for a signed-in user', async () => {
    store.rememberUser(ALEX);
    store.write({ user: ALEX.id }, { state: named('Cached'), updatedAt: at(1), dirty: false, base: at(1) });
    cloud.currentUser = never;
    const res = await quick().start();
    expect(res.kind === 'ready' && res.state.profile.name).toBe('Cached');
  });

  it('keeps a change waiting (offline) if the upload hangs', async () => {
    cloud.user = ALEX;
    const r = quick();
    await r.start();
    cloud.save = never;
    r.save(named('A'));
    await r.idle();
    expect(r.status).toBe('offline');
    expect(r.hasPendingChanges()).toBe(true);
  });

  it("reports 'unavailable' on a new device when the account can't be loaded", async () => {
    cloud.user = ALEX;
    cloud.rows.set(ALEX.id, { data: named('Alex'), updatedAt: at(0) });
    cloud.fetch = never;
    expect((await quick().start()).kind).toBe('unavailable');
  });

  it('still opens an empty app for a brand-new account', async () => {
    cloud.user = ALEX;
    const res = await quick().start();
    expect(res.kind).toBe('ready');
  });
});
