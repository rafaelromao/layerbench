import { useState } from 'react';

/**
 * A message about something wrong that lasts as long as the problem does, which can be put away.
 * Closed, it stays away until the message changes: a new problem is a new message.
 */
export function ErrorAlert({ message }: { message: string }) {
  const [closed, setClosed] = useState<string | null>(null);
  if (closed === message) return null;
  return (
    <div role="alert" className="alert alert-error text-sm flex justify-between">
      <span>{message}</span>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        aria-label="Close message"
        onClick={() => setClosed(message)}
      >
        ✕
      </button>
    </div>
  );
}
