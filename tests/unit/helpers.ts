import { MemoryStorageAdapter } from '../../src/core/storage';
import { createDefaultState } from '../../src/core/state';
import { generatePlan } from '../../src/core/planner';
import type { AppState } from '../../src/core/types';
import { Vault } from '../../src/core/vault';
import { App } from '../../src/ui/app';
import type { ViewContext } from '../../src/ui/context';
import { vi } from 'vitest';

export const ITER = 1000;
export const PASS = 'test passphrase 123';
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

export async function makeApp(initial?: AppState) {
  current?.dispose();
  document.body.innerHTML = '<div id="app"></div>';
  window.location.hash = '';
  const root = document.getElementById('app') as HTMLElement;
  const storage = new MemoryStorageAdapter();
  const vault = new Vault(storage, ITER);
  if (initial) await vault.create(PASS, initial);
  vault.lock();
  const app = new App(root, vault, { now: () => NOW });
  current = app;
  await app.start();
  await settle(app);
  return { app, root, vault, storage };
}

export async function unlock(app: App, root: HTMLElement, pass = PASS) {
  const input = root.querySelector<HTMLInputElement>('#unlock-pass')!;
  input.value = pass;
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle(app, 12);
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
    update: vi.fn(async (mutate) => mutate(ctx.state)),
    navigate: vi.fn(),
    toast: vi.fn(),
    lock: vi.fn(),
    replaceState: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    vault: new Vault(new MemoryStorageAdapter(), ITER),
    today: () => '2026-10-27',
    animate: () => true,
    ...overrides,
  };
  return ctx;
}
