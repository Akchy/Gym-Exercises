import './styles.css';
import { createStorage } from './core/config';
import { Vault } from './core/vault';
import { App } from './ui/app';
import { InstallManager, registerServiceWorker } from './pwa/register';
import { applyTheme } from './ui/theme';

applyTheme();

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');

if (!window.isSecureContext || !crypto?.subtle) {
  root.textContent = 'This app needs a secure (HTTPS) connection to encrypt your data. Please open it over HTTPS.';
} else {
  const vault = new Vault(createStorage(import.meta.env));
  const install = new InstallManager();
  void new App(root, vault, { install }).start();
  if (import.meta.env.PROD) void registerServiceWorker();
}
