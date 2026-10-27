import type { Cloud, CloudRecord, CloudUser } from '../../src/core/cloud';
import type { AppState } from '../../src/core/types';

/** In-memory stand-in for Supabase: one row per user, a session, and an "offline" switch. */
export class FakeCloud implements Cloud {
  user: CloudUser | null = null;
  offline = false;
  /** When set, every request is refused with this server error (e.g. a misconfigured table). */
  reject: string | null = null;
  readonly rows = new Map<string, CloudRecord>();
  readonly saves: string[] = [];
  signIns = 0;

  private net(): void {
    if (this.offline) throw new Error('TypeError: Failed to fetch');
    if (this.reject) throw new Error(this.reject);
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
  async save(userId: string, data: AppState, updatedAt: string, expected: string | null) {
    this.net();
    const current = this.rows.get(userId);
    if ((current?.updatedAt ?? null) !== expected) return false; // someone else saved in between
    this.saves.push(updatedAt);
    this.rows.set(userId, { data: structuredClone(data), updatedAt });
    return true;
  }
  async remove(userId: string) {
    this.net();
    this.rows.delete(userId);
  }
}

export const ALEX: CloudUser = { id: 'user-1', email: 'alex@example.com' };
