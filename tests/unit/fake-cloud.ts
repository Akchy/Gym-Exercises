import type { Cloud, CloudRecord, CloudUser } from '../../src/core/cloud';
import type { AppState } from '../../src/core/types';

/** In-memory stand-in for Supabase: one row per user, a session, and an "offline" switch. */
export class FakeCloud implements Cloud {
  user: CloudUser | null = null;
  offline = false;
  readonly rows = new Map<string, CloudRecord>();
  readonly saves: string[] = [];
  signIns = 0;

  private net(): void {
    if (this.offline) throw new Error('Failed to fetch');
  }

  async currentUser() {
    this.net();
    return this.user;
  }
  async signInWithGoogle() {
    this.signIns++;
  }
  async signOut() {
    this.user = null;
  }
  async fetch(userId: string) {
    this.net();
    return this.rows.get(userId) ?? null;
  }
  async save(userId: string, data: AppState, updatedAt: string) {
    this.net();
    this.saves.push(updatedAt);
    this.rows.set(userId, { data: structuredClone(data), updatedAt });
  }
  async remove(userId: string) {
    this.net();
    this.rows.delete(userId);
  }
}

export const ALEX: CloudUser = { id: 'user-1', email: 'alex@example.com' };
