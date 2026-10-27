import './styles.css';
import { cloudFromEnv } from './core/cloud';
import { DeviceStore } from './core/store';
import { Repository } from './core/sync';
import { App } from './ui/app';
import { InstallManager, registerServiceWorker } from './pwa/register';
import { applyTheme } from './ui/theme';

applyTheme();

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');

// Google sends the user back to the app's own address (including a GitHub Pages subfolder).
const cloud = cloudFromEnv(import.meta.env, new URL(import.meta.env.BASE_URL, window.location.origin).href);
const repo = new Repository(new DeviceStore(), cloud);
void new App(root, repo, { install: new InstallManager() }).start();
if (import.meta.env.PROD) void registerServiceWorker();
