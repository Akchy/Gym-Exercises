import type { AppState } from '../core/types';
import type { Vault } from '../core/vault';

export interface ViewContext {
  state: AppState;
  /** Applies a change, persists it (encrypted) and re-renders. */
  update(mutate: (draft: AppState) => void, opts?: { render?: boolean }): Promise<void>;
  navigate(path: string): void;
  toast(message: string): void;
  lock(): void;
  /** Replaces the whole state (e.g. after import). */
  replaceState(state: AppState): Promise<void>;
  /** Wipes the vault and returns to the welcome screen. */
  destroy(): Promise<void>;
  vault: Vault;
  today(): string;
  animate(): boolean;
}
