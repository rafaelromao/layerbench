import { useEffect, useId, useRef, useState } from 'react';
import type { SubmitOutcome } from '../../auth/github-session.js';

type Step = { kind: 'confirm' } | { kind: 'sending' } | SubmitOutcome;

/**
 * A change to the Library that opens a pull request: asked about first, then sent, then its pull
 * request's link, or why there is none. One CI would refuse is not offered: the dialog says why.
 * Mount it while it is open, as `NameDialog` is.
 */
export function ChangeDialog({
  title,
  question,
  refusal = null,
  confirm,
  run,
  onDone,
  onClose,
}: {
  title: string;
  /** What will happen, asked before anything is sent. */
  question: string;
  /** Why the change cannot be made, if it cannot: then nothing is asked or sent. */
  refusal?: string | null;
  /** The button that sends it. */
  confirm: string;
  run: () => Promise<SubmitOutcome>;
  /** Told once the pull request is open. */
  onDone?: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<Step>({ kind: 'confirm' });

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const send = async () => {
    setStep({ kind: 'sending' });
    let outcome: SubmitOutcome;
    try {
      outcome = await run();
    } catch (e) {
      outcome = { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
    setStep(outcome);
    if (outcome.kind === 'sent') onDone?.();
  };

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="modal-box max-w-md space-y-3">
        <h2 id={titleId} className="font-semibold text-base">
          {title}
        </h2>
        {step.kind === 'confirm' &&
          (refusal ? (
            <p className="text-sm" role="alert">
              It cannot be done: {refusal}.
            </p>
          ) : (
            <p className="text-sm">{question}</p>
          ))}
        {step.kind === 'sending' && (
          <p className="text-sm" role="status">
            Opening the pull request…
          </p>
        )}
        {step.kind === 'sent' && (
          <p className="text-sm" role="status">
            {step.reused
              ? 'The pull request open for it has this now: '
              : 'The pull request is open: '}
            <a className="link" href={step.url} target="_blank" rel="noopener noreferrer">
              {step.url}
            </a>
            .
          </p>
        )}
        {step.kind === 'refused' && (
          <p className="text-sm" role="alert">
            Nothing was sent: {step.reason}.
          </p>
        )}
        {step.kind === 'failed' && (
          <p className="text-sm" role="alert">
            It could not be sent: {step.error}.
          </p>
        )}
        {step.kind === 'signed-out' && (
          <p className="text-sm" role="alert">
            You were signed out; sign in and try again.
          </p>
        )}
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={step.kind === 'sending'}
            onClick={() => dialog.current?.close()}
          >
            {step.kind === 'confirm' && !refusal ? 'Cancel' : 'Close'}
          </button>
          {step.kind === 'confirm' && !refusal && (
            <button type="button" className="btn btn-warning btn-sm" onClick={() => void send()}>
              {confirm}
            </button>
          )}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
}
