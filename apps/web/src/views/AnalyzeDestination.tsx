import { Link } from '@tanstack/react-router';
import { toast } from '../state/toasts.js';
import type { RawSearch } from '../url/params.js';
import { portableSearchTooLong } from '../url/share-target.js';

export function AnalyzeDestination({
  search,
  label,
  children,
  className,
}: {
  search: RawSearch;
  label?: string;
  children: string;
  className: string;
}) {
  if (portableSearchTooLong('analyze', search, window.location.origin))
    return (
      <button
        type="button"
        className={className}
        aria-label={label}
        onClick={() =>
          toast.error('This URL would be too long. Choose a smaller custom rule set or layout.')
        }
      >
        {children}
      </button>
    );
  return (
    <Link to="/analyze" search={search as never} aria-label={label} className={className}>
      {children}
    </Link>
  );
}
