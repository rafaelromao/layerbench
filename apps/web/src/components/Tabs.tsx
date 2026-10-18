import { type KeyboardEvent, type ReactNode, useRef } from 'react';

/** One tab: what it stands for, and what it reads. */
export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

/** The id of a tab, and of the panel it shows, under a prefix that keeps them apart on a page. */
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const tabPanelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * A row of tabs that is one stop for Tab: the selected tab takes focus, and the arrow keys move to
 * the one before or after it — round from the last to the first — and select it, Home and End to
 * the first and last. The selected tab controls the panel under `tabPanelId(prefix, id)`: a view may
 * draw only that one.
 */
export function Tabs<T extends string>({
  label,
  prefix,
  tabs,
  value,
  onChange,
  className = '',
}: {
  /** What the row of tabs is, for a screen reader. */
  label: string;
  prefix: string;
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((t) => t.id === value);
    const to =
      e.key === 'ArrowRight'
        ? (at + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (at - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    onChange(tabs[to].id);
    row.current?.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
  };
  return (
    <div
      ref={row}
      role="tablist"
      aria-label={label}
      className={`tabs tabs-border tabs-sm ${className}`}
      onKeyDown={onKeyDown}
    >
      {tabs.map(({ id, label: text }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={tabId(prefix, id)}
          aria-selected={value === id}
          aria-controls={value === id ? tabPanelId(prefix, id) : undefined}
          tabIndex={value === id ? 0 : -1}
          className={`tab ${value === id ? 'tab-active' : ''}`}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
