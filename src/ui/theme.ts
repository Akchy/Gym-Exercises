/**
 * Light/dark theme preference. It is a per-device display setting (not personal data), so it
 * lives in plain localStorage and applies before unlock, including on the lock screen.
 */
export type Theme = 'system' | 'light' | 'dark';

export const THEME_KEY = 'gymx:theme';
/** Fired on window after the theme changes, so controls can update without a re-render. */
export const THEME_EVENT = 'gymx:themechange';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getTheme(): Theme {
  try {
    const v = storage()?.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** The theme actually on screen ('system' resolved through the OS preference). */
export function effectiveTheme(theme = getTheme()): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme = getTheme(), root: HTMLElement = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') storage()?.removeItem(THEME_KEY);
    else storage()?.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked: the choice still applies for this visit */
  }
  applyTheme(theme);
  globalThis.dispatchEvent?.(new Event(THEME_EVENT));
}
