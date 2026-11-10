import { useCallback, useRef, useState } from 'react';
import { signIn, signOut, useGitHubSession } from '../auth/github-session.js';
import { HelpLink } from '../components/HelpLink.js';
import { HELP } from '../guide/help.js';
import { toast } from '../state/toasts.js';
import { noteResult, useSync } from './auto-sync.js';
import { CopyUpError } from './composite.js';
import { SyncNote } from './SyncNote.js';
import { useSyncSummary } from './sync-status.js';
import { useCopyUp } from './use-storage.js';

function Where({ login }: { login: string }) {
  return (
    <p className="text-xs">
      Saving to secret{' '}
      <a
        className="link"
        href={`https://gist.github.com/${login}`}
        target="_blank"
        rel="noreferrer"
      >
        gists in your account
      </a>
      , one for layouts, one for rule sets and one for corpora. Secret gists are unlisted, not
      private: anyone with a gist's address can read it.
    </p>
  );
}

const documents = (n: number) => `${n} document${n === 1 ? '' : 's'}`;

/**
 * Where custom documents live. Layouts, rule sets and corpora are always kept in this browser;
 * signing in with GitHub keeps them in secret gists in the user's account too, so they follow
 * them between machines.
 */
export function StorageSettings() {
  const dialog = useRef<HTMLDialogElement>(null);
  const status = useGitHubSession((s) => s.status);
  const login = useGitHubSession((s) => s.login);
  const [copying, setCopying] = useState(false);
  const copyUp = useCopyUp();
  const summary = useSyncSummary();
  // What is held back for another account is for the user to release from the status, not to be
  // sent past that by a copy of everything.
  const held = useSync((s) => s.held !== null);

  const signedIn = status === 'signed-in' && !!login;

  const copy = useCallback(async () => {
    if (!copyUp) return;
    setCopying(true);
    try {
      const result = await copyUp();
      // Conflicts found are the dialog's to ask about, as any other attempt's are.
      noteResult(result);
      const { copied, current, conflicts, taken } = result;
      toast.info(
        `Copied ${documents(copied)} to GitHub${current > 0 ? `; ${current} ${current === 1 ? 'was' : 'were'} already up to date` : ''}${
          conflicts.length > 0
            ? `; ${conflicts.length} ${conflicts.length === 1 ? 'was' : 'were'} changed here and in GitHub, and ${conflicts.length === 1 ? 'waits' : 'wait'} for you to choose`
            : ''
        }${
          taken > 0
            ? `; ${taken} ${taken === 1 ? 'layout stays' : 'layouts stay'} in this browser, as GitHub has another of the same name`
            : ''
        }`,
      );
    } catch (e) {
      const copied = e instanceof CopyUpError ? e.copied : 0;
      toast.error(
        `Copying stopped after ${documents(copied)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setCopying(false);
    }
  }, [copyUp]);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        aria-label={
          summary.kind === 'plain' || summary.kind === 'checking' || summary.kind === 'synced'
            ? signedIn
              ? `Storage: this browser and GitHub (@${login})`
              : 'Storage: this browser only'
            : // The words on the button come first, so the name has them in it.
              `Storage${summary.label}: ${summary.text}`
        }
        onClick={() => dialog.current?.showModal()}
      >
        Storage{summary.label}
      </button>

      <dialog ref={dialog} className="modal" aria-labelledby="storage-settings-title">
        <div className="modal-box max-w-lg space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="storage-settings-title" className="font-semibold text-base">
              Storage
            </h2>
            <HelpLink help={HELP.storage} />
          </div>
          <p className="text-xs opacity-70">
            Your layouts, rule sets and corpora are saved in this browser.
            {status === 'unavailable'
              ? ' Signing in with GitHub, which keeps them in your account as well, is not set up where this copy of the app runs.'
              : signedIn
                ? ' They are kept in your GitHub account as well, so they follow you to other browsers.'
                : ' Sign in with GitHub to keep them in secret gists in your account as well, so they follow you to other browsers.'}
          </p>

          <SyncNote without="sign-in" />

          {(status === 'signed-out' || status === 'unknown') && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={status === 'unknown'}
              onClick={() => void signIn()}
            >
              Sign in with GitHub
            </button>
          )}

          {signedIn && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs">
                  Signed in as <span className="font-mono">@{login}</span>
                </span>
                <button type="button" className="btn btn-xs" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>

              <Where login={login} />

              <div className="flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-1">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!copyUp || copying || held}
                  onClick={() => void copy()}
                >
                  {copying ? 'Copying…' : "Copy this browser's documents up"}
                </button>
              </div>
              <p className="text-xs opacity-70">
                What you save is sent to your account by itself: after you sign in, and again if a
                save could not reach it. This sends everything again, to repair what looks missing.
              </p>
            </>
          )}

          <div className="modal-action">
            <button type="button" className="btn btn-sm" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  );
}
