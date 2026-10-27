import type { Repository } from '../core/sync';
import type { AppState } from '../core/types';
import type { InstallManager } from '../pwa/register';

export interface ViewContext {
  state: AppState;
  /** Where the data is kept (this device or the signed-in account) and its sync status. */
  repo: Repository;
  /** Applies a change, saves it and re-renders. */
  update(mutate: (draft: AppState) => void, opts?: { render?: boolean }): Promise<void>;
  navigate(path: string): void;
  toast(message: string): void;
  /** Replaces the whole state (e.g. after restoring a backup). */
  replaceState(state: AppState): Promise<void>;
  /** Goes to Google sign-in (the page navigates away). */
  signIn(): Promise<void>;
  /** Signs out on this device and returns to the first screen. */
  signOut(): Promise<void>;
  /** Erases the data (account and device) and returns to the first screen. Throws when offline. */
  destroy(): Promise<void>;
  today(): string;
  animate(): boolean;
  /** Present when the browser supports installing the app. */
  install?: InstallManager;
}
