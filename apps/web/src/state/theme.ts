export type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * Theme lives on the root element so CSS reacts without a re-render. The choice itself is stored
 * with the rest of the session preferences; "system" follows the operating system and keeps
 * following it as it changes.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  const theme =
    choice === 'system'
      ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
        ? 'dark'
        : 'light'
      : choice;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-theme-source', choice === 'system' ? 'system' : 'user');
  applyIcon(theme);
}

/**
 * The tab's icon, in the colours of the theme in force. The page starts with one that follows the
 * system, as the landing page's does; a theme chosen here is one the system cannot know about.
 */
function applyIcon(theme: 'light' | 'dark'): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const href = link?.getAttribute('href');
  if (!link || !href) return;
  link.setAttribute('href', href.replace(/favicon(-light|-dark)?\.svg$/, `favicon-${theme}.svg`));
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
