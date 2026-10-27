/**
 * The device copy of the user's data, kept in localStorage as plain JSON.
 *
 * - Local mode ("use without an account"): the only copy, under `gymx:local`.
 * - Cloud mode: a cache of the signed-in user's data under `gymx:cache:<userId>`, so the
 *   app opens and works offline; `dirty` marks changes not uploaded yet.
 */
import type { CloudUser } from './cloud';
import { sanitizeState } from './state';
import type { AppState } from './types';

export type Mode = 'local' | 'cloud';

export interface DeviceRecord {
  state: AppState;
  /** When the user last changed this data (ISO timestamp). */
  updatedAt: string;
  /** True while changes are waiting to be uploaded (cloud mode only). */
  dirty: boolean;
}

/** Which record: the local-mode data, or a signed-in user's cache. */
export type RecordKey = 'local' | { user: string };

const PREFIX = 'gymx:';

export class DeviceStore {
  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  private static nameOf(key: RecordKey): string {
    return key === 'local' ? 'local' : `cache:${key.user}`;
  }

  private readJson(key: string): unknown {
    try {
      const raw = this.storage.getItem(PREFIX + key);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown): void {
    try {
      this.storage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) {
      throw new Error(`Could not save on this device (storage full or blocked): ${(err as Error).message}`);
    }
  }

  mode(): Mode | null {
    const m = this.readJson('mode');
    return m === 'local' || m === 'cloud' ? m : null;
  }

  setMode(mode: Mode | null): void {
    if (mode) this.writeJson('mode', mode);
    else this.storage.removeItem(PREFIX + 'mode');
  }

  /** The stored record, validated; null when missing or unreadable. */
  read(key: RecordKey): DeviceRecord | null {
    const raw = this.readJson(DeviceStore.nameOf(key));
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.updatedAt !== 'string' || Number.isNaN(Date.parse(r.updatedAt))) return null;
    try {
      return { state: sanitizeState(r.state), updatedAt: r.updatedAt, dirty: r.dirty === true };
    } catch {
      return null;
    }
  }

  write(key: RecordKey, record: DeviceRecord): void {
    this.writeJson(DeviceStore.nameOf(key), record);
  }

  remove(key: RecordKey): void {
    this.storage.removeItem(PREFIX + DeviceStore.nameOf(key));
  }

  /** The last signed-in user, so the app can open offline when the session can't be checked. */
  rememberedUser(): CloudUser | null {
    const u = this.readJson('user');
    if (!u || typeof u !== 'object') return null;
    const { id, email } = u as Record<string, unknown>;
    return typeof id === 'string' && id ? { id, email: typeof email === 'string' ? email : null } : null;
  }

  rememberUser(user: CloudUser | null): void {
    if (user) this.writeJson('user', user);
    else this.storage.removeItem(PREFIX + 'user');
  }
}
