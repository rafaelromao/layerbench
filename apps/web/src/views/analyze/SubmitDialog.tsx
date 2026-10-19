import { BUNDLED_LAYOUTS, type Layout, toCanonicalJson } from '@layerbench/core';
import { useEffect, useId, useRef, useState } from 'react';
import {
  type SubmitOutcome,
  signIn,
  submitLayout,
  useGitHubSession,
} from '../../auth/github-session.js';
import { readCommunityOnce, useCommunity } from '../../community/community.js';
import { submissionProblems } from '../../community/submit.js';

const idsOf = (layouts: Layout[]) => layouts.flatMap((l) => (l.id ? [l.id] : []));

type Step =
  | { kind: 'checking' }
  | { kind: 'missing'; problems: string[] }
  | { kind: 'ready' }
  | { kind: 'sending' }
  | SubmitOutcome;

/**
 * Submit: proposing a custom layout as a community layout. It asks a user who is not signed in to
 * sign in, says what the layout lacks, and otherwise asks before it opens the pull request, which
 * is public and names who sent it; then it gives that pull request's link. Mount it while it is
 * open, as `NameDialog` is.
 */
export function SubmitDialog({
  layout,
  dirty,
  onClose,
}: {
  /** The custom layout, under the id it is stored by. */
  layout: Layout;
  dirty: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { status, login } = useGitHubSession();
  const [step, setStep] = useState<Step>({ kind: 'checking' });

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (status !== 'signed-in') return;
    let live = true;
    setStep({ kind: 'checking' });
    void readCommunityOnce().then(() => {
      if (!live) return;
      const problems = submissionProblems(layout, {
        dirty,
        bundledIds: idsOf(BUNDLED_LAYOUTS),
        communityIds: idsOf(useCommunity.getState().layouts),
      });
      setStep(problems.length > 0 ? { kind: 'missing', problems } : { kind: 'ready' });
    });
    return () => {
      live = false;
    };
  }, [status, layout, dirty]);

  const send = async () => {
    setStep({ kind: 'sending' });
    setStep(await submitLayout(toCanonicalJson(layout)));
  };

  // Who is signed in decides first: a signed-out user is asked to sign in, whatever else is so.
  const shown: Step | { kind: 'unavailable' } =
    status === 'unavailable'
      ? { kind: 'unavailable' }
      : status === 'signed-out'
        ? { kind: 'signed-out' }
        : status === 'unknown'
          ? { kind: 'checking' }
          : step;

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
          Submit {layout.name}
        </h2>
        <p className="text-xs opacity-70">
          Submit proposes this layout for the Library's community layouts, by a pull request on
          GitHub. Once it is merged, everyone finds it in the Library.
        </p>
        <Body step={shown} login={login} onSend={() => void send()} />
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
}

function Body({
  step,
  login,
  onSend,
}: {
  step: Step | { kind: 'unavailable' };
  login: string | null;
  onSend: () => void;
}) {
  switch (step.kind) {
    case 'checking':
    case 'sending':
      return (
        <p className="text-sm" role="status">
          {step.kind === 'checking' ? 'Checking the layout…' : 'Opening the pull request…'}
        </p>
      );
    case 'unavailable':
      return (
        <p className="text-sm" role="alert">
          This copy of LayerBench has no sign-in, so it cannot submit layouts.
        </p>
      );
    case 'signed-out':
      return (
        <div className="space-y-2" role="alert">
          <p className="text-sm">
            Sign in with GitHub to submit a layout: the pull request names you.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void signIn()}>
            Sign in with GitHub
          </button>
        </div>
      );
    case 'missing':
      return (
        <div className="space-y-1" role="alert">
          <p className="text-sm">Nothing was sent. Before it can be submitted:</p>
          <ul className="list-disc pl-5 text-sm">
            {step.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      );
    case 'ready':
      return (
        <div className="space-y-2">
          <p className="text-sm">
            This opens a public pull request that adds the layout as it is saved, naming you
            {login ? ` (@${login})` : ''} as who sent it.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onSend}>
            Open the pull request
          </button>
        </div>
      );
    case 'sent':
      return (
        <p className="text-sm" role="status">
          {step.reused
            ? 'Your open pull request for it now has this version: '
            : 'The pull request is open: '}
          <a className="link" href={step.url} target="_blank" rel="noopener noreferrer">
            {step.url}
          </a>
          . It joins the Library once the maintainer merges it.
        </p>
      );
    case 'refused':
      return (
        <p className="text-sm" role="alert">
          Nothing was sent: {step.reason}
        </p>
      );
    case 'failed':
      return (
        <p className="text-sm" role="alert">
          It could not be sent: {step.error}. Try again in a moment.
        </p>
      );
  }
}
