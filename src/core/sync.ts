/**
 * Where the app's data lives and how it syncs.
 *
 * - Local mode: data stays on this device only.
 * - Cloud mode (signed in with Google): every change is saved on the device first (so the
 *   app works offline), marked as waiting, and uploaded to Supabase when possible.
 *   Each device remembers which cloud version its data is based on. An upload only replaces
 *   the cloud copy if nobody else saved since; otherwise the two are merged (see merge.ts),
 *   so a device that was open or offline for a while never wipes out another device's work.
 */
import { isNetworkError, type Cloud, type CloudRecord, type CloudUser } from './cloud';
import { mergeVersions, type Version } from './merge';
import { createDefaultState, sanitizeState } from './state';
import type { DeviceStore, Mode } from './store';
import type { AppState } from './types';

/** "error" means the server refused a save (details in `lastError`); "offline" means it couldn't be reached. */
export type SyncStatus = 'local' | 'synced' | 'saving' | 'offline' | 'error';

export type StartResult =
  | { kind: 'welcome' }
  | { kind: 'ready'; state: AppState }
  /** Signed in after using the app without an account, and both sides have data. */
  | { kind: 'link'; device: AppState; account: AppState }
  /** Signed in on a device with no saved copy, and the account couldn't be loaded. */
  | { kind: 'unavailable' };

/** Gives up after this many back-to-back conflicts (another device saving constantly). */
const MAX_CONFLICT_RETRIES = 5;

/** Rejects if `promise` takes longer than `ms`, so a hanging request can't freeze the app. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for the server')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** A cloud row as validated app data, or null when it is missing or unusable. */
function validVersion(rec: CloudRecord | null): Version | null {
  if (!rec || Number.isNaN(Date.parse(rec.updatedAt))) return null;
  try {
    return { state: sanitizeState(rec.data), updatedAt: rec.updatedAt };
  } catch {
    return null;
  }
}

/** Same cloud version? (Supabase may format the same time differently, e.g. "Z" vs "+00:00".) */
function sameVersion(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && Date.parse(a) === Date.parse(b);
}

export interface RepositoryOptions {
  now?: () => Date;
  /** How long the sign-in check at launch may take before the app opens without it (ms). */
  launchTimeoutMs?: number;
  /** How long any other request to the account may take (ms). */
  requestTimeoutMs?: number;
}

export class Repository {
  mode: Mode | null = null;
  user: CloudUser | null = null;
  status: SyncStatus = 'local';
  /** Why the last save was refused (status "error"). */
  lastError: string | null = null;
  private uploading: Promise<void> | null = null;
  private pendingLink: { device: AppState; account: Version } | null = null;
  private readonly listeners = new Set<(s: SyncStatus) => void>();
  private readonly dataListeners = new Set<(s: AppState) => void>();
  private readonly now: () => Date;
  private readonly launchTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly store: DeviceStore,
    private readonly cloud: Cloud | null,
    opts: RepositoryOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.launchTimeoutMs = opts.launchTimeoutMs ?? 4_000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 15_000;
  }

  /** A request to the account, given up after `requestTimeoutMs`. */
  private request<T>(call: () => Promise<T>): Promise<T> {
    return withTimeout(call(), this.requestTimeoutMs);
  }

  /** False when the app was built without Supabase settings (local-only app). */
  get cloudEnabled(): boolean {
    return this.cloud !== null;
  }

  /** Whether "Continue with Google" can work right now (configured, and Supabase answered at launch). */
  get signInAvailable(): boolean {
    return this.cloud !== null && this.cloudReachable;
  }
  private cloudReachable = true;

  onStatus(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called when another device's changes were merged into the data while saving. */
  onData(listener: (s: AppState) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  private setStatus(status: SyncStatus, error: string | null = null): void {
    this.status = status;
    this.lastError = error;
    for (const l of this.listeners) l(status);
  }

  /** Records a failed request: "offline" if the server couldn't be reached, else "error" with the reason. */
  private failed(err: unknown): void {
    if (isNetworkError(err)) this.setStatus('offline');
    else this.setStatus('error', err instanceof Error ? err.message : String(err));
  }

  /**
   * Decides what to show on launch: the app (signed in, or "without an account" chosen before),
   * the "which data?" choice, or otherwise the landing page.
   */
  async start(): Promise<StartResult> {
    if (this.cloud) {
      let user: CloudUser | null;
      try {
        user = await withTimeout(this.cloud.currentUser(), this.launchTimeoutMs);
      } catch {
        // Offline, slow or unreachable: open with the last signed-in user and their cached data.
        this.cloudReachable = false;
        user = this.store.rememberedUser();
      }
      if (user) return this.enterCloud(user);
    }
    if (this.store.mode() === 'local') return { kind: 'ready', state: this.chooseLocal() };
    return { kind: 'welcome' };
  }

  /** "Use without an account": data stays on this device. */
  chooseLocal(): AppState {
    this.mode = 'local';
    this.user = null;
    this.store.setMode('local');
    this.setStatus('local');
    return this.store.read('local')?.state ?? createDefaultState(this.now());
  }

  private async enterCloud(user: CloudUser): Promise<StartResult> {
    const local = this.store.read('local');
    if (local?.state.onboarded) return this.link(user, local.state);
    this.useCloudMode(user);
    const cached = this.store.read({ user: user.id });
    if (cached) {
      this.setStatus(cached.dirty ? 'offline' : 'synced');
      return { kind: 'ready', state: cached.state };
    }
    // New device: wait for the account's data instead of showing an empty app.
    const state = await this.pull();
    if (state) return { kind: 'ready', state };
    // No data and no answer: an empty app here could later be mistaken for the user's data.
    if (this.status === 'offline' || this.status === 'error') return { kind: 'unavailable' };
    return { kind: 'ready', state: createDefaultState(this.now()) };
  }

  private useCloudMode(user: CloudUser): void {
    this.mode = 'cloud';
    this.user = user;
    this.store.setMode('cloud');
    this.store.rememberUser(user);
  }

  /** First sign-in after using the app without an account. */
  private async link(user: CloudUser, device: AppState): Promise<StartResult> {
    let account: Version | null;
    try {
      account = validVersion(await this.request(() => this.cloud!.fetch(user.id)));
    } catch {
      // Can't see the account yet: keep using this device's data and try again next launch.
      return { kind: 'ready', state: this.chooseLocal() };
    }
    this.useCloudMode(user);
    if (!account) return { kind: 'ready', state: await this.adoptDeviceData(device, null) };
    this.pendingLink = { device, account };
    return { kind: 'link', device, account: account.state };
  }

  /** Answers the "which data?" question from `start()`. */
  async resolveLink(choice: 'account' | 'device'): Promise<AppState> {
    const link = this.pendingLink;
    if (!link || !this.user) throw new Error('Nothing to resolve');
    this.pendingLink = null;
    if (choice === 'device') return this.adoptDeviceData(link.device, link.account.updatedAt);
    this.store.write({ user: this.user.id }, { ...link.account, dirty: false, base: link.account.updatedAt });
    this.store.remove('local');
    this.setStatus('synced');
    return link.account.state;
  }

  /** Moves this device's no-account data into the account (replacing cloud version `base`, if any). */
  private async adoptDeviceData(state: AppState, base: string | null): Promise<AppState> {
    this.store.write({ user: this.user!.id }, { state, updatedAt: this.now().toISOString(), dirty: true, base });
    this.store.remove('local');
    await this.upload();
    return state;
  }

  /** Saves a change on the device right away; in cloud mode it then uploads in the background. */
  save(state: AppState): void {
    const updatedAt = this.now().toISOString();
    if (this.mode === 'cloud' && this.user) {
      const base = this.store.read({ user: this.user.id })?.base ?? null;
      this.store.write({ user: this.user.id }, { state, updatedAt, dirty: true, base });
      void this.upload();
    } else {
      this.store.write('local', { state, updatedAt, dirty: false, base: null });
    }
  }

  /** Uploads waiting changes. Never throws: on failure they stay waiting for the next try. */
  upload(): Promise<void> {
    if (this.uploading) return this.uploading.then(() => this.upload());
    this.uploading = this.runUpload().finally(() => (this.uploading = null));
    return this.uploading;
  }

  private async runUpload(): Promise<void> {
    const { cloud, user } = this;
    if (!cloud || !user || this.mode !== 'cloud') return;
    const key = { user: user.id };
    for (let conflicts = 0; ; ) {
      const rec = this.store.read(key);
      if (!rec?.dirty) break;
      this.setStatus('saving');
      let saved: boolean;
      try {
        saved = await this.request(() => cloud.save(user.id, rec.state, rec.updatedAt, rec.base));
      } catch (err) {
        return this.failed(err);
      }
      const latest = this.store.read(key)!;
      if (saved) {
        // The cloud now holds rec; anything saved on the device meanwhile is still waiting.
        this.store.write(key, { ...latest, dirty: latest.updatedAt !== rec.updatedAt, base: rec.updatedAt });
        continue;
      }
      // Another device saved since our base version: merge its copy in and try again.
      if (++conflicts > MAX_CONFLICT_RETRIES) return this.setStatus('error', 'Another device keeps saving at the same time. Your changes are kept and will be retried.');
      let raw: CloudRecord | null;
      try {
        raw = await this.request(() => cloud.fetch(user.id));
      } catch (err) {
        return this.failed(err);
      }
      const remote = validVersion(raw);
      const merged = remote ? mergeVersions(latest, remote) : latest.state;
      this.store.write(key, { state: merged, updatedAt: this.now().toISOString(), dirty: true, base: raw?.updatedAt ?? null });
      if (remote) for (const l of this.dataListeners) l(merged);
    }
    this.setStatus('synced');
  }

  /** Resolves when no upload is running (used before signing out and by tests). */
  async idle(): Promise<void> {
    while (this.uploading) await this.uploading;
  }

  /**
   * Checks the account for changes from other devices. Returns the data to show when it
   * changed (the cloud copy, or this device's changes merged with it); null when nothing new.
   * Waiting changes on this device are uploaded.
   */
  async pull(): Promise<AppState | null> {
    const { cloud, user } = this;
    if (!cloud || !user || this.mode !== 'cloud') return null;
    const key = { user: user.id };
    let raw: CloudRecord | null;
    try {
      raw = await this.request(() => cloud.fetch(user.id));
    } catch (err) {
      this.failed(err);
      return null;
    }
    const remote = validVersion(raw);
    const device = this.store.read(key);
    if (!device) {
      if (!remote) {
        this.setStatus('synced');
        return null;
      }
      this.store.write(key, { ...remote, dirty: false, base: remote.updatedAt });
      this.setStatus('synced');
      return remote.state;
    }
    if (!remote || sameVersion(remote.updatedAt, device.base)) {
      // Nobody else saved (or the cloud copy is missing/unusable): just send ours if needed.
      if (!remote) this.store.write(key, { ...device, dirty: true, base: raw?.updatedAt ?? null });
      await this.upload();
      return null;
    }
    if (!device.dirty) {
      this.store.write(key, { ...remote, dirty: false, base: remote.updatedAt });
      this.setStatus('synced');
      return remote.state;
    }
    // Both changed: keep everything from both sides, then upload the result.
    const merged = mergeVersions(device, remote);
    this.store.write(key, { state: merged, updatedAt: this.now().toISOString(), dirty: true, base: remote.updatedAt });
    await this.upload();
    return merged;
  }

  /** True when signed in and some changes haven't reached the cloud yet. */
  hasPendingChanges(): boolean {
    return this.mode === 'cloud' && !!this.user && !!this.store.read({ user: this.user.id })?.dirty;
  }

  /** Leaves Google sign-in for this app (the page navigates away). */
  signIn(): Promise<void> {
    if (!this.cloud) throw new Error('Sign-in is not configured');
    return this.cloud.signInWithGoogle();
  }

  /** Signs out on this device and removes the device copy, so the next person sees nothing. */
  async signOut(): Promise<void> {
    if (this.cloud) {
      try {
        await this.cloud.signOut();
      } catch {
        /* the local session is cleared by the library even when the server can't be reached */
      }
    }
    if (this.user) this.store.remove({ user: this.user.id });
    this.store.rememberUser(null);
    this.store.clearDrafts();
    this.forget();
  }

  /** Erases the user's data: the cloud row (needs a connection) and the device copy. */
  async deleteAll(): Promise<void> {
    if (this.mode === 'cloud' && this.user && this.cloud) {
      await this.idle();
      await this.request(() => this.cloud!.remove(this.user!.id));
      await this.signOut();
      return;
    }
    this.store.remove('local');
    this.store.clearDrafts();
    this.forget();
  }

  /** An unsaved workout in progress for a plan day (or "free"), as stored by the log screen. */
  draft(dayId: string): unknown {
    return this.store.drafts()[dayId] ?? null;
  }

  hasDraft(dayId: string): boolean {
    return this.draft(dayId) !== null;
  }

  /** Stores (or with null, discards) the unsaved workout for a day. Never throws. */
  setDraft(dayId: string, draft: unknown | null): void {
    try {
      this.store.setDraft(dayId, draft);
    } catch {
      /* storage full: the draft just isn't kept */
    }
  }

  private forget(): void {
    this.mode = null;
    this.user = null;
    this.store.setMode(null);
    this.setStatus('local');
  }
}
