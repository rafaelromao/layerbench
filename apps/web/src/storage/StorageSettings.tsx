import { useCallback, useRef, useState } from 'react';
import { signIn, signOut, useGitHubSession } from '../auth/github-session.js';
import { HelpLink } from '../components/HelpLink.js';
import { HELP } from '../guide/help.js';
import { toast } from '../state/toasts.js';
import { CopyUpError } from './composite.js';
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

  const signedIn = status === 'signed-in' && !!login;

  const copy = useCallback(async () => {
    if (!copyUp) return;
    setCopying(true);
    try {
      const { copied, current } = await copyUp();
      toast.info(
        `Copied ${documents(copied)} to GitHub${current > 0 ? `; ${current} ${current === 1 ? 'was' : 'were'} already up to date` : ''}`,
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
          signedIn ? `Storage: this browser and GitHub (@${login})` : 'Storage: this browser only'
        }
        onClick={() => dialog.current?.showModal()}
      >
        Storage{signedIn ? ' ✓' : ''}
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
                  disabled={!copyUp || copying}
                  onClick={() => void copy()}
                >
                  {copying ? 'Copying…' : "Copy this browser's documents up"}
                </button>
              </div>
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
