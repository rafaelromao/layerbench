export type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * Theme lives on the root element so CSS reacts without a re-render. The choice itself is stored
 * with the rest of the session preferences; "system" follows the operating system and keeps
 * following it as it changes.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-source', 'system');
  } else {
    root.setAttribute('data-theme', choice);
    root.setAttribute('data-theme-source', 'user');
  }
}

/** Keep "system" in step with the operating system for as long as it is selected. */
export function watchSystemTheme(get: () => ThemeChoice): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => {};
  const onChange = () => {
    if (get() === 'system') applyTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
