/**
 * App controller: owns the current data, saves every change through the Repository (device
 * first, then the cloud when signed in), routes between views and applies newer data
 * synced from another device.
 */
import { toISODate } from '../core/dates';
import { sanitizeState } from '../core/state';
import type { Repository } from '../core/sync';
import type { AppState } from '../core/types';
import type { ToastAction, ViewContext } from './context';
import type { InstallManager } from '../pwa/register';
import { isPhone } from './device';
import { clear, h, svg } from './dom';
import { prefersReducedMotion } from './figure';
import { effectiveTheme, setTheme, THEME_EVENT } from './theme';
import { renderDashboard } from './views/dashboard';
import { renderExerciseDetail, renderExerciseList } from './views/exercises';
import { renderLogForm, renderLogPicker } from './views/log';
import { renderNotFound } from './views/notfound';
import { renderOnboarding } from './views/onboarding';
import { renderPlan, renderPlanEditor } from './views/plan';
import { renderProgress } from './views/progress';
import { renderSettings, syncStatusText } from './views/settings';
import { renderLinkChoice, renderUnavailable, renderWelcome } from './views/welcome';
import { renderWorkout } from './views/workout';

export interface AppOptions {
  now?: () => Date;
  install?: InstallManager;
  /** Window used for routing/events (injectable for tests). */
  win?: Window;
}

const NAV = [
  ['/', 'Home'],
  ['/plan', 'Plan'],
  ['/exercises', 'Exercises'],
  ['/log', 'Log'],
  ['/progress', 'Progress'],
  ['/settings', 'Settings'],
] as const;

/** First path segment of every page; anything else is "Page not found". */
const SECTIONS = new Set(['', 'onboarding', 'plan', 'exercises', 'log', 'workout', 'progress', 'settings']);
/**
 * The page a link pointed to before the welcome screen. Kept in sessionStorage because
 * Google sign-in leaves the app and comes back to the base URL, without the hash.
 */
const RETURN_KEY = 'gymx:returnTo';

export class App {
  private state: AppState | null = null;
  /** "Which data should we keep?" after signing in with data on both sides. */
  private link: { device: AppState; account: AppState } | null = null;
  /** Signed in on a new device, but the account's data couldn't be loaded. */
  private unavailable = false;
  /** Newer data from another device, held back while a workout is being logged. */
  private pendingRemote: AppState | null = null;
  private readonly now: () => Date;
  private readonly win: Window;
  private readonly install?: InstallManager;
  private readonly toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly mainEl: HTMLElement;
  private themeBtn: HTMLButtonElement | null = null;
  private header: HTMLElement | null = null;
  /** Route of the last rendered view: re-rendering the same page keeps the scroll position. */
  private renderedPath: string | null = null;
  private readonly stopStatus: () => void;
  private readonly stopData: () => void;

  constructor(
    private readonly root: HTMLElement,
    private readonly repo: Repository,
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
    this.win.addEventListener(THEME_EVENT, this.syncThemeButton);
    this.win.addEventListener('click', this.onOutsideClick);
    this.win.document.addEventListener('visibilitychange', this.onVisible);
    // The sync status in Settings updates in place, without re-rendering the page.
    this.stopStatus = repo.onStatus((s) => {
      for (const el of this.root.querySelectorAll('[data-sync-status]')) el.textContent = syncStatusText(s, repo.lastError);
    });
    // Another device's changes merged in while saving: show them.
    this.stopData = repo.onData((s) => void this.applyRemote(s));
  }

  private readonly onHashChange = () => {
    if (this.pendingRemote && !this.onLogForm()) {
      this.state = this.pendingRemote;
      this.pendingRemote = null;
    }
    void this.render();
  };
  private readonly onOffline = () => this.toast("You're offline. Everything keeps working on this device.");
  private readonly onOnline = () => {
    this.toast('Back online.');
    void this.syncNow();
  };
  /** Coming back to the app (tab or phone app): pick up changes made on other devices meanwhile. */
  private readonly onVisible = () => {
    if (this.win.document.visibilityState === 'visible') void this.syncNow();
  };
  /** Mobile menu: a tap anywhere outside the header closes it. */
  private readonly onOutsideClick = (ev: Event) => {
    if (this.header && !this.header.contains(ev.target as Node)) this.setMenuOpen(false);
  };

  private setMenuOpen(open: boolean): void {
    this.header?.classList.toggle('menu-open', open);
    const btn = this.header?.querySelector('.menu-toggle');
    btn?.setAttribute('aria-expanded', String(open));
    btn?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  /** Updates the header toggle in place: re-rendering would wipe a half-filled workout log. */
  private readonly syncThemeButton = () => {
    if (!this.themeBtn) return;
    const dark = effectiveTheme() === 'dark';
    const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    this.themeBtn.textContent = dark ? '☀' : '☾';
    this.themeBtn.setAttribute('aria-label', label);
    this.themeBtn.title = label;
  };

  /** Removes global listeners (the app is single-page, mostly useful in tests). */
  dispose(): void {
    this.win.removeEventListener('hashchange', this.onHashChange);
    this.win.removeEventListener('offline', this.onOffline);
    this.win.removeEventListener('online', this.onOnline);
    this.win.removeEventListener(THEME_EVENT, this.syncThemeButton);
    this.win.removeEventListener('click', this.onOutsideClick);
    this.win.document.removeEventListener('visibilitychange', this.onVisible);
    this.stopStatus();
    this.stopData();
  }

  get currentState(): AppState | null {
    return this.state;
  }

  async start(): Promise<void> {
    clear(this.root);
    this.root.append(this.mainEl, this.toastEl);
    const result = await this.repo.start();
    // Start clean: "Try again" runs this a second time.
    this.state = null;
    this.link = null;
    if (result.kind === 'ready') this.state = result.state;
    if (result.kind === 'link') this.link = { device: result.device, account: result.account };
    this.unavailable = result.kind === 'unavailable';
    await this.render();
    if (result.kind === 'ready' && this.repo.mode === 'cloud') void this.syncNow();
  }

  /**
   * Checks the account for changes from other devices (merging them with this device's
   * waiting changes) and uploads what is waiting. See Repository.pull.
   */
  private async syncNow(): Promise<void> {
    if (this.repo.mode !== 'cloud' || !this.state) return;
    const newer = await this.repo.pull();
    if (newer) await this.applyRemote(newer);
  }

  /** Shows data that changed through syncing, but never swaps it in mid-workout. */
  private async applyRemote(next: AppState): Promise<void> {
    if (!this.state) return;
    if (this.onLogForm()) {
      this.pendingRemote = next;
      return;
    }
    this.state = next;
    await this.render();
  }

  private onLogForm(): boolean {
    return /^\/(log|workout)\/[^/?]+/.test(this.route());
  }

  private route(): string {
    const hash = this.win.location.hash.replace(/^#/, '');
    return hash.startsWith('/') ? hash : '/';
  }

  private get returnTo(): string | null {
    try {
      return this.win.sessionStorage.getItem(RETURN_KEY);
    } catch {
      return null;
    }
  }

  private set returnTo(path: string | null) {
    try {
      if (path) this.win.sessionStorage.setItem(RETURN_KEY, path);
      else this.win.sessionStorage.removeItem(RETURN_KEY);
    } catch {
      /* storage blocked: the link just isn't remembered */
    }
  }

  navigate(path: string): void {
    if (this.route() === path) void this.render();
    else this.win.location.hash = path;
  }

  toast(message: string, action?: ToastAction): void {
    this.toastEl.replaceChildren(message);
    if (action) {
      const btn = h('button', { type: 'button', class: 'link' }, action.label);
      btn.addEventListener('click', () => {
        this.toastEl.classList.remove('show');
        action.run();
      });
      this.toastEl.append(' ', btn);
    }
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), action ? 8000 : 3500);
  }

  /** Waits for background uploads (used by tests). */
  flush(): Promise<void> {
    return this.repo.idle();
  }

  private persist(): void {
    try {
      this.repo.save(this.state as AppState);
    } catch (err) {
      this.toast(`Could not save: ${(err as Error).message}`);
    }
  }

  /** Back to the landing page after signing out or deleting everything. */
  private async reset(): Promise<void> {
    this.state = null;
    this.pendingRemote = null;
    this.win.location.hash = '/';
    await this.render();
  }

  private context(): ViewContext {
    const state = this.state as AppState;
    return {
      state,
      repo: this.repo,
      update: async (mutate, opts = {}) => {
        if (!this.state) return;
        // A workout saved while newer synced data was waiting is added on top of that data.
        const base = this.pendingRemote ?? this.state;
        this.pendingRemote = null;
        const draft = structuredClone(base);
        mutate(draft);
        this.state = sanitizeState(draft);
        this.persist();
        if (opts.render !== false) await this.render();
      },
      replaceState: async (next) => {
        this.state = next;
        this.persist();
        this.navigate('/');
      },
      signIn: () => this.repo.signIn(),
      signOut: async () => {
        await this.repo.idle();
        await this.repo.signOut();
        await this.reset();
      },
      destroy: async () => {
        await this.repo.deleteAll();
        setTheme('system');
        await this.reset();
      },
      navigate: (p) => this.navigate(p),
      toast: (m, a) => this.toast(m, a),
      today: () => toISODate(this.now()),
      animate: () => (this.state?.settings.animations ?? true) && !prefersReducedMotion(),
      install: this.install,
    };
  }

  private nav(path: string): HTMLElement {
    const themeBtn = h('button', { type: 'button', class: 'icon theme-toggle' });
    themeBtn.addEventListener('click', () => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'));
    this.themeBtn = themeBtn;
    this.syncThemeButton();
    // Hamburger icon (shown on narrow screens only, see .menu-toggle in styles.css).
    const icon = svg('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true' },
      ...[6, 12, 18].map((y) => svg('line', { x1: 4, x2: 20, y1: y, y2: y })));
    const menuBtn = h('button', { type: 'button', class: 'icon menu-toggle', 'aria-controls': 'main-nav', 'aria-expanded': 'false', 'aria-label': 'Open menu' }, icon);
    menuBtn.addEventListener('click', () => this.setMenuOpen(!this.header?.classList.contains('menu-open')));
    const top = '/' + (path.split('?')[0].split('/')[1] ?? '');
    const header = h(
      'header',
      { class: 'topbar' },
      h('a', { href: '#/', class: 'brand' }, 'GymFree'),
      h(
        'nav',
        { 'aria-label': 'Main', id: 'main-nav' },
        ...NAV.map(([href, label]) => h('a', { href: `#${href}`, 'aria-current': top === href ? 'page' : null }, label)),
      ),
      themeBtn,
      menuBtn,
    );
    header.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && header.classList.contains('menu-open')) {
        this.setMenuOpen(false);
        menuBtn.focus();
      }
    });
    // Choosing the page you are already on doesn't change the hash, so close explicitly.
    header.querySelector('nav')!.addEventListener('click', (ev) => (ev.target as Element).closest('a') && this.setMenuOpen(false));
    this.header = header;
    return header;
  }

  /** The first screen: the "which data?" choice, or sign in / use without an account. */
  private renderEntry(): HTMLElement {
    if (this.unavailable) {
      return renderUnavailable({
        email: this.repo.user?.email ?? null,
        onRetry: () => this.start(),
        onSignOut: async () => {
          await this.repo.signOut();
          this.unavailable = false;
          await this.reset();
        },
      });
    }
    if (this.link) {
      return renderLinkChoice(this.link, async (choice) => {
        this.state = await this.repo.resolveLink(choice);
        this.link = null;
        this.navigate('/');
      });
    }
    // Remember a link opened before choosing where the data lives; opening home forgets it.
    const path = this.route();
    this.returnTo = path === '/' || path === '/onboarding' ? null : path;
    return renderWelcome({
      signInAvailable: this.repo.signInAvailable,
      onGoogle: () => this.repo.signIn(),
      onLocal: () => {
        this.state = this.repo.chooseLocal();
        this.navigate('/onboarding');
      },
    });
  }

  async render(): Promise<void> {
    clear(this.mainEl);
    const path = this.route();
    const [pathname, query = ''] = path.split('?');
    const [, section = '', param = ''] = pathname.split('/');
    if (!this.state) {
      this.renderedPath = null;
      this.mainEl.appendChild(SECTIONS.has(section) ? this.renderEntry() : renderNotFound({ path, hasData: false }));
      return;
    }
    const ctx = this.context();
    if (!this.state.onboarded && path !== '/onboarding') {
      this.navigate('/onboarding');
      return;
    }
    // Arriving home after sign-in or onboarding: open the link that brought the user here.
    const returnTo = this.returnTo;
    if (returnTo && path === '/') {
      this.returnTo = null;
      this.navigate(returnTo);
      return;
    }
    const from = new URLSearchParams(query).get('from') ?? undefined;
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
      case 'workout':
        // Workout mode is for phones; elsewhere (and for free workouts) the list view is used.
        if (param === 'free' || !isPhone()) return this.navigate(`/log/${param}`);
        view = this.state.plan.some((d) => d.id === decodeURIComponent(param)) ? renderWorkout(ctx, decodeURIComponent(param)) : renderNotFound({ path, hasData: true });
        break;
      case 'progress':
        view = renderProgress(ctx);
        break;
      case 'settings':
        view = renderSettings(ctx);
        break;
      default:
        view = renderNotFound({ path, hasData: true });
    }
    // Workout mode fills the screen, so it has no top bar.
    if (section === 'workout' && view.classList.contains('reel')) this.mainEl.append(view);
    else this.mainEl.append(this.nav(path), view);
    if (path === this.renderedPath) return;
    this.renderedPath = path;
    const scrollTo = this.win.scrollTo?.bind(this.win);
    try {
      scrollTo?.(0, 0);
    } catch {
      /* not implemented in some environments */
    }
  }
}
