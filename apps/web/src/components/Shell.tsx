import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useSession } from '../state/session.js';
import type { ThemeChoice } from '../state/theme.js';
import { useToasts } from '../state/toasts.js';

const NAV = [
  { to: '/', label: 'Analyze' },
  { to: '/edit', label: 'Edit' },
  { to: '/compare', label: 'Compare' },
  { to: '/rules', label: 'Rules' },
  { to: '/corpus', label: 'Corpus' },
  { to: '/library', label: 'Library' },
] as const;

const THEMES: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: 'system', label: 'Follow the system theme', icon: '◐' },
  { value: 'light', label: 'Light theme', icon: '☀' },
  { value: 'dark', label: 'Dark theme', icon: '☾' },
];

function ThemeToggle() {
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
          onClick={() => setTheme(t.value)}
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

/** Page frame: navigation, theme control and the toast region every view shares. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2">
        Skip to content
      </a>
      <header className="navbar bg-base-100 border-b border-base-300 px-3 sm:px-4 min-h-12 sticky top-0 z-20">
        <Link to="/" className="btn btn-ghost btn-sm text-base font-semibold">
          <span className="text-primary">Layout</span>Master
        </Link>
        <nav aria-label="Main" className="ml-2 hidden md:block">
          <ul className="menu menu-horizontal menu-sm gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeProps={{ className: 'active' }}
                  activeOptions={{ exact: item.to === '/' }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <details className="dropdown dropdown-end md:hidden ml-2">
          <summary className="btn btn-ghost btn-sm">Menu</summary>
          <ul className="menu dropdown-content bg-base-100 rounded-box z-30 w-40 p-2 shadow">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link to={item.to}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </details>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="px-3 py-4 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-[1600px] space-y-4">{children}</div>
      </main>
      <ToastRegion />
    </>
  );
}
