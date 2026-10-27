import { HttpStorageAdapter, LocalStorageAdapter, type StorageAdapter } from './storage';

export interface AppEnv {
  VITE_STORAGE_BACKEND?: string;
  VITE_STORAGE_URL?: string;
}

/**
 * Picks the storage backend from build-time env vars:
 *   VITE_STORAGE_BACKEND=local (default)  -> browser localStorage, no server needed
 *   VITE_STORAGE_BACKEND=http             -> VITE_STORAGE_URL (e.g. "/api/storage" behind SSO)
 * Either way only ciphertext leaves the vault.
 */
export function createStorage(env: AppEnv, local: Storage = globalThis.localStorage): StorageAdapter {
  const backend = (env.VITE_STORAGE_BACKEND ?? 'local').toLowerCase();
  if (backend === 'local') return new LocalStorageAdapter(local);
  if (backend === 'http') {
    if (!env.VITE_STORAGE_URL) throw new Error('VITE_STORAGE_URL is required when VITE_STORAGE_BACKEND=http');
    return new HttpStorageAdapter(env.VITE_STORAGE_URL);
  }
  throw new Error(`Unknown storage backend: ${backend}`);
}
