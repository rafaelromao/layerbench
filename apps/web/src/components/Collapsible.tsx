import { type ReactNode, useId } from 'react';
import { useSession } from '../state/session.js';

/**
 * A group of the page that folds away under its heading. Folded, its contents stay mounted, so a
 * word being explained or a panel's state is still there when it opens again. Which groups are
 * folded is kept in this browser; a group that starts folded keeps being opened instead.
 */
export function Collapsible({
  id,
  title,
  extra,
  className = '',
  defaultCollapsed = false,
  children,
}: {
  /** Stable across visits: what the folded state is kept under. */
  id: string;
  title: string;
  /** Beside the heading, visible folded or not: a "?", a status. */
  extra?: ReactNode;
  className?: string;
  /** Folded until it is opened, for a group the page does not need to show to be read. */
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const collapsed = useSession((s) =>
    defaultCollapsed ? !s.openedGroups.includes(id) : s.collapsedGroups.includes(id),
  );
  const toggle = useSession((s) => s.toggleGroup);
  // Not the id above: two groups on one page may share it, to fold and open together.
  const bodyId = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <h2 className="m-0 font-semibold text-sm">
          <button
            type="button"
            className="lb-collapse-toggle inline-flex items-center gap-1 cursor-pointer"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => toggle(id, defaultCollapsed)}
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
