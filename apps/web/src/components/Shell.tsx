import { Link, useLocation } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { useSession } from '../state/session.js';
import type { ThemeChoice } from '../state/theme.js';
import { useToasts } from '../state/toasts.js';
import { StorageSettings } from '../storage/StorageSettings.js';
import { useDismiss } from './use-dismiss.js';

/** The Library comes first: it is where the site opens, and where a layout is picked. */
const NAV = [
  { to: '/library', label: 'Library' },
  { to: '/analyze', label: 'Analyze' },
  { to: '/edit', label: 'Edit' },
  { to: '/compare', label: 'Compare' },
  { to: '/rules', label: 'Rules' },
  { to: '/corpus', label: 'Corpus' },
  { to: '/guide', label: 'Guide' },
] as const;

const THEMES: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: 'system', label: 'Follow the system theme', icon: '◐' },
  { value: 'light', label: 'Light theme', icon: '☀' },
  { value: 'dark', label: 'Dark theme', icon: '☾' },
];

function ThemeToggle({ onPick }: { onPick?: () => void }) {
  const theme = useSession((s) => s.theme);
  const setTheme = useSession((s) => s.setTheme);
  return (
    <fieldset className="join border-0 p-0 m-0">
      <legend className="sr-only">Theme</legend>
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          className={`btn btn-xs join-item ${theme === t.value ? 'btn-active' : 'btn-ghost'}`}
          aria-label={t.label}
          aria-pressed={theme === t.value}
          title={t.label}
          onClick={() => {
            setTheme(t.value);
            onPick?.();
          }}
        >
          {t.icon}
        </button>
      ))}
    </fieldset>
  );
}

function ToastRegion() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="toast toast-top toast-end z-50" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`alert ${t.kind === 'error' ? 'alert-error' : 'alert-info'}`}
          role="alert"
        >
          <span className="text-sm">{t.text}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            aria-label="close"
            onClick={() => dismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Moves focus into the new view when the route changes, so a screen reader announces it and the
 * next Tab continues from the content. Search parameters change on every control the user touches,
 * so only the path counts.
 */
function useFocusOnRouteChange() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger, not an input.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
  }, [pathname]);

  return main;
}

/**
 * The views, behind one button on a narrow screen. A `<details>` stays open until it is told
 * otherwise, so it is closed when a view is chosen, when the pointer goes down anywhere else, and
 * on Escape — and after any navigation, whatever caused it.
 */
function MobileMenu() {
  const menu = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  const close = useCallback(() => {
    if (menu.current) menu.current.open = false;
  }, []);
  useDismiss(menu, close);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger, not an input.
  useEffect(close, [pathname, close]);

  return (
    <details ref={menu} className="dropdown dropdown-end md:hidden ml-2">
      <summary className="btn btn-ghost btn-sm">Menu</summary>
      <div className="dropdown-content bg-base-100 rounded-box z-30 w-56 p-2 shadow space-y-2">
        <ul className="menu w-full p-0">
          {NAV.map((item) => (
            <li key={item.to}>
              <Link to={item.to} onClick={close} activeProps={{ className: 'menu-active' }}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        {/* The header has no room for it on a phone; here it is one tap from anywhere. */}
        <div className="flex items-center justify-between gap-2 border-t border-base-300 px-3 pt-2">
          <span className="text-sm opacity-70">Theme</span>
          <ThemeToggle onPick={close} />
        </div>
      </div>
    </details>
  );
}

/** Page frame: navigation, theme control and the toast region every view shares. */
export function Shell({ children }: { children: ReactNode }) {
  const main = useFocusOnRouteChange();

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2">
        Skip to content
      </a>
      <header className="navbar bg-base-100 border-b border-base-300 px-3 sm:px-4 min-h-12 sticky top-0 z-20">
        <Link to="/library" className="btn btn-ghost btn-sm text-base font-semibold">
          <span className="text-primary">Layout</span>Master
        </Link>
        <nav aria-label="Main" className="ml-2 hidden md:block">
          <ul className="menu menu-horizontal menu-sm gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link to={item.to} activeProps={{ className: 'menu-active' }}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <MobileMenu />
        <div className="ml-auto flex items-center gap-2">
          <StorageSettings />
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main
        id="main"
        ref={main}
        tabIndex={-1}
        className="px-3 py-4 sm:px-4 lg:px-6 focus:outline-none"
      >
        <div className="mx-auto max-w-[1600px] space-y-4">{children}</div>
      </main>
      <ToastRegion />
    </>
  );
}
