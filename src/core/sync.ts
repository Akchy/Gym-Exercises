/**
 * Where the app's data lives and how it syncs.
 *
 * - Local mode: data stays on this device only.
 * - Cloud mode (signed in with Google): every change is saved on the device first (so the
 *   app works offline), marked as waiting, and uploaded to Supabase when possible.
 *   When the device and the cloud disagree, the most recently changed copy wins.
 */
import type { Cloud, CloudRecord, CloudUser } from './cloud';
import { createDefaultState, sanitizeState } from './state';
import type { DeviceRecord, DeviceStore, Mode } from './store';
import type { AppState } from './types';

export type SyncStatus = 'local' | 'synced' | 'saving' | 'offline';

export type StartResult =
  | { kind: 'welcome' }
  | { kind: 'ready'; state: AppState }
  /** Signed in after using the app without an account, and both sides have data. */
  | { kind: 'link'; device: AppState; account: AppState };

interface Version {
  state: AppState;
  updatedAt: string;
}

/** Which copy to keep when the device and the cloud may differ. */
export function decide(
  device: DeviceRecord | null,
  cloud: Version | null,
): 'use-cloud' | 'upload-device' | 'in-sync' | 'none' {
  if (!device) return cloud ? 'use-cloud' : 'none';
  if (!cloud) return 'upload-device';
  const d = Date.parse(device.updatedAt);
  const c = Date.parse(cloud.updatedAt);
  if (c > d) return 'use-cloud';
  if (d > c || device.dirty) return 'upload-device';
  return 'in-sync';
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

export interface RepositoryOptions {
  now?: () => Date;
}

export class Repository {
  mode: Mode | null = null;
  user: CloudUser | null = null;
  status: SyncStatus = 'local';
  private uploading: Promise<void> | null = null;
  private pendingLink: { device: AppState; account: Version } | null = null;
  private readonly listeners = new Set<(s: SyncStatus) => void>();
  private readonly now: () => Date;

  constructor(
    private readonly store: DeviceStore,
    private readonly cloud: Cloud | null,
    opts: RepositoryOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  /** False when the app was built without Supabase settings (local-only app). */
  get cloudEnabled(): boolean {
    return this.cloud !== null;
  }

  onStatus(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    for (const l of this.listeners) l(status);
  }

  /** Decides what to show on launch: the welcome screen, the app, or the "which data?" choice. */
  async start(): Promise<StartResult> {
    if (this.cloud) {
      let user: CloudUser | null;
      try {
        user = await this.cloud.currentUser();
      } catch {
        // Offline (or Supabase unreachable): keep the last signed-in user and their cached data.
        user = this.store.rememberedUser();
      }
      if (user) return this.enterCloud(user);
    }
    if (!this.cloud || this.store.mode() === 'local') return { kind: 'ready', state: this.chooseLocal() };
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
    return { kind: 'ready', state: (await this.pull()) ?? createDefaultState(this.now()) };
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
      account = validVersion(await this.cloud!.fetch(user.id));
    } catch {
      // Can't see the account yet: keep using this device's data and try again next launch.
      return { kind: 'ready', state: this.chooseLocal() };
    }
    this.useCloudMode(user);
    if (!account) return { kind: 'ready', state: await this.adoptDeviceData(device) };
    this.pendingLink = { device, account };
    return { kind: 'link', device, account: account.state };
  }

  /** Answers the "which data?" question from `start()`. */
  async resolveLink(choice: 'account' | 'device'): Promise<AppState> {
    const link = this.pendingLink;
    if (!link || !this.user) throw new Error('Nothing to resolve');
    this.pendingLink = null;
    if (choice === 'device') return this.adoptDeviceData(link.device);
    this.store.write({ user: this.user.id }, { ...link.account, dirty: false });
    this.store.remove('local');
    this.setStatus('synced');
    return link.account.state;
  }

  private async adoptDeviceData(state: AppState): Promise<AppState> {
    this.store.write({ user: this.user!.id }, { state, updatedAt: this.now().toISOString(), dirty: true });
    this.store.remove('local');
    await this.upload();
    return state;
  }

  /** Saves a change on the device right away; in cloud mode it then uploads in the background. */
  save(state: AppState): void {
    const updatedAt = this.now().toISOString();
    if (this.mode === 'cloud' && this.user) {
      this.store.write({ user: this.user.id }, { state, updatedAt, dirty: true });
      void this.upload();
    } else {
      this.store.write('local', { state, updatedAt, dirty: false });
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
    for (;;) {
      const rec = this.store.read({ user: user.id });
      if (!rec?.dirty) break;
      this.setStatus('saving');
      try {
        await cloud.save(user.id, rec.state, rec.updatedAt);
      } catch {
        this.setStatus('offline');
        return;
      }
      // Only mark as uploaded if nothing changed while the upload was running.
      const latest = this.store.read({ user: user.id });
      if (latest?.updatedAt === rec.updatedAt) this.store.write({ user: user.id }, { ...latest, dirty: false });
    }
    this.setStatus('synced');
  }

  /** Resolves when no upload is running (used before signing out and by tests). */
  async idle(): Promise<void> {
    while (this.uploading) await this.uploading;
  }

  /**
   * Fetches the account's data. Returns it when the cloud copy is newer (the caller shows it);
   * uploads the device copy when that is newer; returns null when there is nothing new.
   */
  async pull(): Promise<AppState | null> {
    const { cloud, user } = this;
    if (!cloud || !user || this.mode !== 'cloud') return null;
    let remote: Version | null;
    try {
      remote = validVersion(await cloud.fetch(user.id));
    } catch {
      this.setStatus('offline');
      return null;
    }
    const device = this.store.read({ user: user.id });
    switch (decide(device, remote)) {
      case 'use-cloud':
        this.store.write({ user: user.id }, { ...remote!, dirty: false });
        this.setStatus('synced');
        return remote!.state;
      case 'upload-device':
        // The cloud copy is older, missing or unusable: send this device's copy.
        if (device && !device.dirty) this.store.write({ user: user.id }, { ...device, dirty: true });
        await this.upload();
        return null;
      default:
        this.setStatus('synced');
        return null;
    }
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
    this.forget();
  }

  /** Erases the user's data: the cloud row (needs a connection) and the device copy. */
  async deleteAll(): Promise<void> {
    if (this.mode === 'cloud' && this.user && this.cloud) {
      await this.idle();
      await this.cloud.remove(this.user.id);
      await this.signOut();
      return;
    }
    this.store.remove('local');
    this.forget();
  }

  private forget(): void {
    this.mode = null;
    this.user = null;
    this.store.setMode(null);
    this.setStatus('local');
  }
}
