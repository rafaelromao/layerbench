import { type Layout, sameName } from '@layerbench/core';
import { useEffect, useId, useRef, useState } from 'react';
import { type SubmitOutcome, signIn, useGitHubSession } from '../../auth/github-session.js';
import { NameDialog, type TakenLayout } from '../../components/NameDialog.js';
import type { LayoutSource } from '../../layout-session/open.js';

/** The name the copy of a proposal goes by, when not the layout's, and the layout it replaces. */
export interface CopyName {
  name: string;
  overwrite?: string;
}

/** How proposing went: as a submission does, or a custom layout has the copy's name already. */
export type ProposeOutcome = SubmitOutcome | { kind: 'name-taken'; taken: TakenLayout };

type Step = { kind: 'choose' } | { kind: 'sending' } | ProposeOutcome;

/**
 * What Save does with a bundled or community layout one has edited: propose the change, by a pull
 * request on GitHub, or save a copy. A proposal is saved here like a copy, until its pull request
 * is merged or closed; where a custom layout has its name, the copy is asked another, or to
 * replace that one, and the pull request keeps the name. Signed out, it asks to sign in first, and
 * Save a copy still works. Mount it while it is open, as `NameDialog` is.
 */
export function ProposeDialog({
  layout,
  source,
  propose,
  copyName,
  taken,
  onCopy,
  onClose,
}: {
  layout: Layout;
  source: LayoutSource;
  /** Saves the layout here, under the copy's name if given, and opens the pull request. */
  propose: (copy?: CopyName) => Promise<ProposeOutcome>;
  /** A name no layout has, offered for the copy when the layout's is taken. */
  copyName: string;
  /** The custom layout that already goes by a name, if any. */
  taken: (name: string) => TakenLayout | null;
  /** Save a copy instead, under a name of its own. */
  onCopy: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { status, login } = useGitHubSession();
  const [step, setStep] = useState<Step>({ kind: 'choose' });

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const send = async (copy?: CopyName) => {
    setStep({ kind: 'sending' });
    try {
      setStep(await propose(copy));
    } catch (e) {
      setStep({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  };
  const copy = () => {
    dialog.current?.close();
    onCopy();
  };
  const where = source.kind === 'bundled' ? 'the Library' : "the Library's community layouts";
  const signedIn = status === 'signed-in';

  const clash = step.kind === 'name-taken' ? step.taken : null;
  return (
    <>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby={titleId}
        onClose={onClose}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="modal-box max-w-md space-y-3">
          <h2 id={titleId} className="font-semibold text-base">
            Save {layout.name}
          </h2>
          <p className="text-xs opacity-70">
            {layout.name} is one of {where}. Propose your change to it, by a pull request on GitHub,
            or save a copy of your own. A proposal is saved here too, until its pull request is
            merged or closed.
          </p>
          <Body step={step} login={login} />
          {step.kind === 'choose' && status === 'signed-out' && (
            <div className="space-y-2" role="alert">
              <p className="text-sm">
                Sign in with GitHub to propose a change: the pull request names you.
              </p>
              <button type="button" className="btn btn-sm" onClick={() => void signIn()}>
                Sign in with GitHub
              </button>
            </div>
          )}
          {step.kind === 'choose' && status === 'unavailable' && (
            <p className="text-sm" role="alert">
              This copy of LayerBench has no sign-in, so it cannot propose changes.
            </p>
          )}
          <div className="modal-action">
            {step.kind === 'choose' && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                  Save a copy
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!signedIn}
                  onClick={() => void send()}
                >
                  Propose change
                </button>
              </>
            )}
            {step.kind !== 'choose' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={step.kind === 'sending'}
                onClick={() => dialog.current?.close()}
              >
                Close
              </button>
            )}
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
      {clash && (
        <NameDialog
          title="Name your copy"
          intro={`A custom layout is already called ${clash.name}. What should your copy be called? The pull request still proposes ${layout.name}.`}
          nameLabel="Name of the copy"
          initialName={copyName}
          submitLabel="Propose change"
          taken={(name) => (sameName(clash.name, name) ? clash : taken(name))}
          onSubmit={(name) => void send({ name })}
          onOverwrite={(name, other) => void send({ name, overwrite: other.id })}
          onClose={() => setStep((now) => (now.kind === 'name-taken' ? { kind: 'choose' } : now))}
        />
      )}
    </>
  );
}

function Body({ step, login }: { step: Step; login: string | null }) {
  switch (step.kind) {
    case 'name-taken':
      return null;
    case 'choose':
      return login ? (
        <p className="text-sm">
          A proposal opens a public pull request with the layout as it is now, naming you (@{login})
          as who sent it.
        </p>
      ) : null;
    case 'sending':
      return (
        <p className="text-sm" role="status">
          Saving it and opening the pull request…
        </p>
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
          . Your copy stays in your layouts until it is merged or closed.
        </p>
      );
    case 'signed-out':
      return (
        <p className="text-sm" role="alert">
          You were signed out, so nothing was proposed; your copy is saved. Sign in and save it
          again to propose it.
        </p>
      );
    case 'refused':
      return (
        <p className="text-sm" role="alert">
          Nothing was proposed: {step.reason}.
        </p>
      );
    case 'failed':
      return (
        <p className="text-sm" role="alert">
          It could not be proposed: {step.error}. Your copy is saved; save it again to try once
          more.
        </p>
      );
  }
}
