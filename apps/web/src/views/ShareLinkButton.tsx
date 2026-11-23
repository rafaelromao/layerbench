import { useState } from 'react';
import { toast } from '../state/toasts.js';

export function ShareLinkButton({ createTarget }: { createTarget: () => Promise<string> }) {
  const [copying, setCopying] = useState(false);

  const copy = async () => {
    setCopying(true);
    try {
      const target = await createTarget();
      if (!navigator.clipboard?.writeText)
        throw new Error(
          'This browser cannot copy links. Copy the address from the address bar instead.',
        );
      await navigator.clipboard.writeText(target);
      toast.info('Copied the link');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the share link');
    } finally {
      setCopying(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-sm btn-outline shrink-0 max-sm:px-1"
      disabled={copying}
      aria-busy={copying}
      aria-label={copying ? 'Copying share link' : 'Share link'}
      title="Copy a share link"
      onClick={() => void copy()}
    >
      <svg
        aria-hidden="true"
        className="size-4 sm:hidden"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4" />
      </svg>
      <span className="hidden sm:inline">{copying ? 'Copying…' : 'Share link'}</span>
    </button>
  );
}
