/**
 * Google sign-in and cloud save on Supabase. The app talks to the small `Cloud` interface
 * (faked in tests); `createSupabaseCloud` is the real implementation.
 *
 * Data model: one row per user in `public.user_data` (see deploy/supabase/schema.sql),
 * protected by Row Level Security so each user can only read and write their own row.
 */
import { createClient } from '@supabase/supabase-js';
import type { AppState } from './types';

export interface CloudUser {
  id: string;
  email: string | null;
}

export interface CloudRecord {
  data: unknown;
  /** When the user made this version (ISO timestamp written by the client). */
  updatedAt: string;
}

export interface Cloud {
  /** The signed-in user, or null. Throws when the session can't be checked (e.g. offline). */
  currentUser(): Promise<CloudUser | null>;
  /** Leaves the page for Google's sign-in and comes back signed in. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  fetch(userId: string): Promise<CloudRecord | null>;
  save(userId: string, data: AppState, updatedAt: string): Promise<void>;
  remove(userId: string): Promise<void>;
}

const TABLE = 'user_data';

export function createSupabaseCloud(url: string, publishableKey: string, redirectTo: string): Cloud {
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) {
    throw new Error('VITE_SUPABASE_URL must be an https:// URL');
  }
  // Only the publishable key may ship in a web app; a secret key would bypass Row Level Security.
  if (/^sb_secret_/.test(publishableKey)) throw new Error('Use the Supabase publishable key, never a secret key');
  const client = createClient(url, publishableKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  return {
    async currentUser() {
      const { data, error } = await client.auth.getSession();
      fail(error);
      const user = data.session?.user;
      return user ? { id: user.id, email: user.email ?? null } : null;
    },
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      fail(error);
    },
    async signOut() {
      // "local" scope: sign out this device only, and succeed even when offline.
      const { error } = await client.auth.signOut({ scope: 'local' });
      fail(error);
    },
    async fetch(userId) {
      const { data, error } = await client.from(TABLE).select('data, updated_at').eq('user_id', userId).maybeSingle();
      fail(error);
      return data ? { data: data.data as unknown, updatedAt: String(data.updated_at) } : null;
    },
    async save(userId, data, updatedAt) {
      const { error } = await client.from(TABLE).upsert({ user_id: userId, data, updated_at: updatedAt });
      fail(error);
    },
    async remove(userId) {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId);
      fail(error);
    },
  };
}

/** The Supabase cloud when both build-time variables are set; otherwise null (local-only app). */
export function cloudFromEnv(
  env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string },
  redirectTo: string,
  create = createSupabaseCloud,
): Cloud | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? create(url, key, redirectTo) : null;
}
