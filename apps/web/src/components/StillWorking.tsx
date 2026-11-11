import { type ReactNode, useEffect, useState } from 'react';

/**
 * Says so when something has been going on for longer than `after` milliseconds, with the way out
 * that is always there: a reload. Mounted for as long as the wait lasts, it starts counting afresh
 * each time it is shown, and shows nothing before then.
 */
export function StillWorking({
  after,
  className = '',
  children,
}: {
  after: number;
  /** Where it sits, which only counts once it shows: nothing is left of it before. */
  className?: string;
  children: ReactNode;
}) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), after);
    return () => clearTimeout(timer);
  }, [after]);
  if (!late) return null;
  return (
    <div
      role="status"
      className={`alert alert-warning flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs ${className}`}
    >
      <span className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">{children}</span>
      <button
        type="button"
        className="btn btn-sm btn-outline shrink-0"
        onClick={() => location.reload()}
      >
        Reload
      </button>
    </div>
  );
}
