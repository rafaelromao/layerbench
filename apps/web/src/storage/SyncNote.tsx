import { ACTION_LABEL, act, type SyncAction, useSyncSummary } from './sync-status.js';

/**
 * Says, where the user is working, that what they saved is not yet where it should be: kept in this
 * browser only, not sent because the sign-in ended or could not be asked, or not sent for a
 * failure. It stays for as long as that is so, and offers the one thing to do about it. Nothing
 * while all is well. `without` leaves out an action the place it is shown has a button for already.
 */
export function SyncNote({ without }: { without?: SyncAction }) {
  const summary = useSyncSummary();
  if (!summary.notable) return null;
  const action = summary.action === without ? null : summary.action;
  const failing =
    summary.kind === 'ended' || summary.kind === 'unreachable' || summary.kind === 'failed';
  return (
    <div
      role="status"
      className={`alert ${failing ? 'alert-error' : 'alert-warning'} flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-xs`}
      data-sync={summary.kind}
    >
      <span className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">{summary.text}</span>
      {action && (
        <button
          type="button"
          className="btn btn-sm btn-outline shrink-0"
          onClick={() => act(action)}
        >
          {ACTION_LABEL[action]}
        </button>
      )}
    </div>
  );
}
