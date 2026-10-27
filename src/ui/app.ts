/**
 * App controller: owns the decrypted state while unlocked, persists every change through
 * the encrypted vault, routes between views and auto-locks after inactivity.
 */
import { toISODate } from '../core/dates';
import { createDefaultState, sanitizeState } from '../core/state';
import type { AppState } from '../core/types';
import type { Vault } from '../core/vault';
import type { ViewContext } from './context';
import type { InstallManager } from '../pwa/register';
import { clear, h } from './dom';
import { prefersReducedMotion } from './figure';
import { renderDashboard } from './views/dashboard';
import { renderExerciseDetail, renderExerciseList } from './views/exercises';
import { renderLogForm, renderLogPicker } from './views/log';
import { renderOnboarding } from './views/onboarding';
import { renderPlan, renderPlanEditor } from './views/plan';
import { renderProgress } from './views/progress';
import { renderSettings } from './views/settings';
import { renderUnlock, renderWelcome, type LockHandlers } from './views/lock';

export interface AppOptions {
  now?: () => Date;
  install?: InstallManager;
  /** Window used for routing/events (injectable for tests). */
  win?: Window;
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

const NAV = [
  ['/', 'Home'],
  ['/plan', 'Plan'],
  ['/exercises', 'Exercises'],
  ['/log', 'Log'],
  ['/progress', 'Progress'],
  ['/settings', 'Settings'],
] as const;

export class App {
  private state: AppState | null = null;
  private saving: Promise<void> = Promise.resolve();
  private lastActivity = Date.now();
  private lockTimer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => Date;
  private readonly win: Window;
  private readonly install?: InstallManager;
  private readonly toastEl: HTMLElement;
  private readonly mainEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly vault: Vault,
    opts: AppOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.win = opts.win ?? window;
    this.install = opts.install;
    this.mainEl = h('div', { id: 'view' });
    this.toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    this.win.addEventListener('hashchange', this.onHashChange);
    this.win.addEventListener('offline', this.onOffline);
    this.win.addEventListener('online', this.onOnline);
    for (const ev of ACTIVITY_EVENTS) this.win.addEventListener(ev, this.onActivity, { passive: true });
  }

  private readonly onHashChange = () => void this.render();
  private readonly onActivity = () => (this.lastActivity = Date.now());
  private readonly onOffline = () => this.toast("You're offline. Everything keeps working on this device.");
  private readonly onOnline = () => this.toast('Back online.');

  /** Removes global listeners and timers (the app is single-page, mostly useful in tests). */
  dispose(): void {
    this.win.removeEventListener('hashchange', this.onHashChange);
    this.win.removeEventListener('offline', this.onOffline);
    this.win.removeEventListener('online', this.onOnline);
    for (const ev of ACTIVITY_EVENTS) this.win.removeEventListener(ev, this.onActivity);
    if (this.lockTimer) clearInterval(this.lockTimer);
    this.lockTimer = null;
  }

  get isUnlocked(): boolean {
    return this.state !== null;
  }

  get currentState(): AppState | null {
    return this.state;
  }

  async start(): Promise<void> {
    clear(this.root);
    this.root.append(this.mainEl, this.toastEl);
    await this.render();
  }

  private lockHandlers(): LockHandlers {
    return {
      create: async (pass) => {
        const initial = createDefaultState(this.now());
        await this.vault.create(pass, initial);
        this.onUnlocked(initial);
        this.navigate('/onboarding');
      },
      unlock: async (pass) => {
        const data = sanitizeState(await this.vault.unlock<unknown>(pass));
        this.onUnlocked(data);
        await this.render();
      },
      restore: async (raw, pass) => {
        const data = await this.vault.importEncrypted(raw, pass, sanitizeState);
        this.onUnlocked(data);
        this.toast('Backup restored.');
        this.navigate('/');
      },
      reset: async () => {
        await this.vault.destroy();
        await this.render();
      },
    };
  }

  private onUnlocked(state: AppState) {
    this.state = state;
    this.lastActivity = Date.now();
    if (this.lockTimer) clearInterval(this.lockTimer);
    this.lockTimer = setInterval(() => this.checkAutoLock(), 15_000);
  }

  /** Locks if the user has been inactive for longer than their auto-lock setting. */
  checkAutoLock(nowMs = Date.now()): boolean {
    if (!this.state) return false;
    if (nowMs - this.lastActivity >= this.state.settings.autoLockMinutes * 60_000) {
      this.lock();
      return true;
    }
    return false;
  }

  lock(): void {
    this.state = null;
    this.vault.lock();
    if (this.lockTimer) clearInterval(this.lockTimer);
    this.lockTimer = null;
    void this.render();
  }

  private route(): string {
    const hash = this.win.location.hash.replace(/^#/, '');
    return hash.startsWith('/') ? hash : '/';
  }

  navigate(path: string): void {
    if (this.route() === path) void this.render();
    else this.win.location.hash = path;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    setTimeout(() => this.toastEl.classList.remove('show'), 3500);
  }

  /** Waits for all pending encrypted saves (used by tests and before locking). */
  flush(): Promise<void> {
    return this.saving;
  }

  private persist(): Promise<void> {
    const snapshot = structuredClone(this.state);
    this.saving = this.saving
      .then(() => this.vault.save(snapshot))
      .catch((err: unknown) => this.toast(`Could not save: ${(err as Error).message}`));
    return this.saving;
  }

  private context(): ViewContext {
    const state = this.state as AppState;
    return {
      state,
      vault: this.vault,
      update: async (mutate, opts = {}) => {
        if (!this.state) return;
        const draft = structuredClone(this.state);
        mutate(draft);
        this.state = sanitizeState(draft);
        await this.persist();
        if (opts.render !== false) await this.render();
      },
      replaceState: async (next) => {
        this.state = next;
        await this.persist();
        this.navigate('/');
      },
      destroy: async () => {
        await this.saving;
        this.state = null;
        await this.vault.destroy();
        if (this.lockTimer) clearInterval(this.lockTimer);
        this.win.location.hash = '/';
        await this.render();
      },
      navigate: (p) => this.navigate(p),
      toast: (m) => this.toast(m),
      lock: () => this.lock(),
      today: () => toISODate(this.now()),
      animate: () => (this.state?.settings.animations ?? true) && !prefersReducedMotion(),
      install: this.install,
    };
  }

  private nav(path: string): HTMLElement {
    const lockBtn = h('button', { type: 'button', class: 'icon', 'aria-label': 'Lock app', title: 'Lock' }, '🔒');
    lockBtn.addEventListener('click', () => this.lock());
    const top = '/' + (path.split('?')[0].split('/')[1] ?? '');
    return h(
      'header',
      { class: 'topbar' },
      h('a', { href: '#/', class: 'brand' }, 'GymFree'),
      h(
        'nav',
        { 'aria-label': 'Main' },
        ...NAV.map(([href, label]) => h('a', { href: `#${href}`, 'aria-current': top === href ? 'page' : null }, label)),
      ),
      lockBtn,
    );
  }

  async render(): Promise<void> {
    clear(this.mainEl);
    if (!this.state) {
      const exists = await this.vault.exists();
      this.mainEl.appendChild(exists ? renderUnlock(this.lockHandlers()) : renderWelcome(this.lockHandlers()));
      this.mainEl.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    const path = this.route();
    const ctx = this.context();
    if (!this.state.onboarded && path !== '/onboarding') {
      this.navigate('/onboarding');
      return;
    }
    const [pathname, query = ''] = path.split('?');
    const from = new URLSearchParams(query).get('from') ?? undefined;
    const [, section = '', param = ''] = pathname.split('/');
    let view: HTMLElement;
    switch (section) {
      case '':
        view = renderDashboard(ctx);
        break;
      case 'onboarding':
        view = renderOnboarding(ctx);
        break;
      case 'plan':
        view = param === 'edit' ? renderPlanEditor(ctx) : renderPlan(ctx);
        break;
      case 'exercises':
        view = param ? renderExerciseDetail(ctx, decodeURIComponent(param), from) : renderExerciseList(ctx);
        break;
      case 'log':
        view = param ? renderLogForm(ctx, decodeURIComponent(param)) : renderLogPicker(ctx);
        break;
      case 'progress':
        view = renderProgress(ctx);
        break;
      case 'settings':
        view = renderSettings(ctx);
        break;
      default:
        view = h('main', { class: 'container' }, h('h1', {}, 'Page not found'), h('a', { href: '#/' }, 'Go home'));
    }
    this.mainEl.append(this.nav(path), view);
    const scrollTo = this.win.scrollTo?.bind(this.win);
    try {
      scrollTo?.(0, 0);
    } catch {
      /* not implemented in some environments */
    }
  }
}
