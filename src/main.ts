import './styles.css';
import { cloudFromEnv } from './core/cloud';
import { DeviceStore } from './core/store';
import { Repository } from './core/sync';
import { App } from './ui/app';
import { h } from './ui/dom';
import { InstallManager, registerServiceWorker } from './pwa/register';
import { applyTheme } from './ui/theme';

applyTheme();

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');

/** Replaces the loading screen with a way out, instead of "Loading…" forever. */
function showStartupError(err: unknown): void {
  console.error(err);
  root!.replaceChildren(
    h(
      'div',
      { class: 'boot', role: 'alert' },
      h('p', { class: 'boot-brand' }, 'GymFree'),
      h('p', {}, 'Something went wrong while starting the app.'),
      h('p', {}, h('a', { href: './?fresh' }, 'Reload')),
    ),
  );
}

try {
  // Google sends the user back to the app's own address (including a GitHub Pages subfolder).
  const cloud = cloudFromEnv(import.meta.env, new URL(import.meta.env.BASE_URL, window.location.origin).href);
  const repo = new Repository(new DeviceStore(), cloud);
  new App(root, repo, { install: new InstallManager() }).start().catch(showStartupError);
} catch (err) {
  showStartupError(err);
}
if (import.meta.env.PROD) void registerServiceWorker();
