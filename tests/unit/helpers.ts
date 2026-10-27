import { createDefaultState } from '../../src/core/state';
import { generatePlan } from '../../src/core/planner';
import { DeviceStore } from '../../src/core/store';
import { Repository } from '../../src/core/sync';
import type { AppState } from '../../src/core/types';
import { App } from '../../src/ui/app';
import type { ViewContext } from '../../src/ui/context';
import type { FakeCloud } from './fake-cloud';
import { vi } from 'vitest';

/** Tuesday 27 Oct 2026, local time. */
export const NOW = new Date(2026, 9, 27, 10, 0, 0);

export async function settle(app?: App, rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (app) await app.flush();
  }
}

export function onboardedState(): AppState {
  const s = createDefaultState(NOW);
  s.onboarded = true;
  s.goal = 'gain-muscle';
  s.profile = { name: 'Alex', experience: 'intermediate', sex: 'unspecified', age: 30, heightCm: 175, weightKg: 70 };
  s.routine.trainingDays = [1, 3, 5];
  s.plan = generatePlan(s.goal, s.routine, s.profile);
  return s;
}

let current: App | null = null;

/**
 * Starts the app on a clean device. `initial` is stored as "use without an account" data;
 * pass a FakeCloud to build the app with Google sign-in enabled.
 */
export async function makeApp(initial?: AppState, opts: { cloud?: FakeCloud } = {}) {
  current?.dispose();
  document.body.innerHTML = '<div id="app"></div>';
  window.location.hash = '';
  localStorage.clear();
  const root = document.getElementById('app') as HTMLElement;
  const store = new DeviceStore(localStorage);
  if (initial) {
    store.setMode('local');
    store.write('local', { state: initial, updatedAt: NOW.toISOString(), dirty: false, base: null });
  }
  // Each save gets a later timestamp, like a real clock.
  let tick = 0;
  const repo = new Repository(store, opts.cloud ?? null, { now: () => new Date(NOW.getTime() + ++tick * 1000) });
  const app = new App(root, repo, { now: () => NOW });
  current = app;
  await app.start();
  await settle(app);
  return { app, root, repo, store };
}

export async function go(app: App, path: string) {
  window.location.hash = path;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle(app);
}

export function change(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function check(el: HTMLInputElement, checked: boolean) {
  el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function byText<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string, text: string | RegExp): T {
  const el = [...root.querySelectorAll<T>(selector)].find((e) => (typeof text === 'string' ? e.textContent?.trim() === text : text.test(e.textContent ?? '')));
  if (!el) throw new Error(`No ${selector} with text ${text}`);
  return el;
}

export function fakeContext(state: AppState, overrides: Partial<ViewContext> = {}): ViewContext {
  const ctx: ViewContext = {
    state,
    repo: new Repository(new DeviceStore(localStorage), null),
    update: vi.fn(async (mutate) => mutate(ctx.state)),
    navigate: vi.fn(),
    toast: vi.fn(),
    replaceState: vi.fn(async () => {}),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    today: () => '2026-10-27',
    animate: () => true,
    ...overrides,
  };
  return ctx;
}
