/**
 * Offline + install support: registers the service worker (production only), keeps the
 * browser's install prompt for an "Install app" button, and reports connectivity.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

export class InstallManager {
  private deferred: BeforeInstallPromptEvent | null = null;
  private listeners = new Set<Listener>();
  installed = false;

  constructor(private readonly win: Window = window) {
    win.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // show our own button instead of the browser mini-bar
      this.deferred = e as BeforeInstallPromptEvent;
      this.emit();
    });
    win.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.installed = true;
      this.emit();
    });
  }

  get canPrompt(): boolean {
    return this.deferred !== null;
  }

  /** True when already running as an installed app. */
  get isStandalone(): boolean {
    const nav = this.win.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true || (typeof this.win.matchMedia === 'function' && this.win.matchMedia('(display-mode: standalone)').matches);
  }

  /** iPhone/iPad Safari has no install prompt: users add it via the Share menu. */
  get isIos(): boolean {
    return /iPad|iPhone|iPod/.test(this.win.navigator.userAgent);
  }

  async prompt(): Promise<boolean> {
    const e = this.deferred;
    if (!e) return false;
    this.deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    this.emit();
    return outcome === 'accepted';
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export async function registerServiceWorker(nav: Navigator = navigator, base = import.meta.env.BASE_URL ?? '/'): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in nav)) return null;
  try {
    return await nav.serviceWorker.register(`${base}sw.js`, { scope: base });
  } catch {
    return null; // offline support is an enhancement; the app works without it
  }
}
