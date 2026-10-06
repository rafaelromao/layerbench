import type { ReactNode } from 'react';
import { useSession } from '../state/session.js';

/**
 * A group of the page that folds away under its heading. Folded, its contents stay mounted, so a
 * word being explained or a panel's state is still there when it opens again. Which groups are
 * folded is kept in this browser.
 */
export function Collapsible({
  id,
  title,
  extra,
  className = '',
  children,
}: {
  /** Stable across visits: what the folded state is kept under. */
  id: string;
  title: string;
  /** Beside the heading, visible folded or not: a "?", a status. */
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const collapsed = useSession((s) => s.collapsedGroups.includes(id));
  const toggle = useSession((s) => s.toggleGroup);
  const bodyId = `group-${id}`;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <h2 className="m-0 font-semibold text-sm">
          <button
            type="button"
            className="lm-collapse-toggle inline-flex items-center gap-1 cursor-pointer"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => toggle(id)}
          >
            <span
              aria-hidden="true"
              className={`inline-block text-xs opacity-60 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            >
              ▾
            </span>
            {title}
          </button>
        </h2>
        {extra}
      </div>
      <div id={bodyId} hidden={collapsed} className={collapsed ? '' : 'mt-2'}>
        {children}
      </div>
    </div>
  );
}
