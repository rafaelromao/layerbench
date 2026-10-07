import { useCallback, useEffect, useRef, useState } from 'react';
import { detectTarget, signIn, signOut, useGitHubSession } from '../auth/github-session.js';
import { HelpLink } from '../components/HelpLink.js';
import { HELP } from '../guide/help.js';
import { toast } from '../state/toasts.js';
import { CompositeStorage } from './composite.js';
import { IndexedDbAdapter } from './indexeddb.js';
import type { StorageTarget } from './target.js';
import { remoteStorage } from './use-storage.js';

function Where({ target, login }: { target: StorageTarget; login: string }) {
  if (target.kind === 'repo') {
    return (
      <p className="text-xs">
        Saving to{' '}
        <a
          className="link font-mono"
          href={`https://github.com/${target.repo}/tree/${target.branch}/${target.path}`}
          target="_blank"
          rel="noreferrer"
        >
          {target.repo}
        </a>
        {target.upstream ? '' : ', your fork'}, on the branch{' '}
        <span className="font-mono">{target.branch}</span>, so its main branch stays as it is.
      </p>
    );
  }
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

/**
 * Where saved documents live. Layouts, rule sets and corpora are always kept in this browser;
 * signing in with GitHub keeps them in the user's account too, so they follow them between
 * machines: in their fork of layerbench when the app may write to one, in gists otherwise.
 */
export function StorageSettings() {
  const dialog = useRef<HTMLDialogElement>(null);
  const status = useGitHubSession((s) => s.status);
  const login = useGitHubSession((s) => s.login);
  const target = useGitHubSession((s) => s.target);
  const targetStatus = useGitHubSession((s) => s.targetStatus);
  const appSlug = useGitHubSession((s) => s.appSlug);
  const upstream = useGitHubSession((s) => s.upstream);
  const [copying, setCopying] = useState(false);

  const signedIn = status === 'signed-in' && !!login;
  const remote = signedIn && !!target;

  const copyUp = useCallback(async () => {
    if (!login || !target) return;
    setCopying(true);
    const composite = new CompositeStorage(new IndexedDbAdapter(), remoteStorage(login, target));
    try {
      let total = 0;
      for (const collection of ['layouts', 'rulesets', 'corpora'] as const) {
        total += await composite.pushAll(collection);
      }
      toast.info(`Copied ${total} document${total === 1 ? '' : 's'} to GitHub`);
    } catch (e) {
      toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCopying(false);
    }
  }, [login, target]);

  // Access given to a fork in another tab shows here when this one is looked at again.
  useEffect(() => {
    if (!signedIn || target?.kind !== 'gist') return;
    const again = () => {
      if (dialog.current?.open) void detectTarget();
    };
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [signedIn, target]);

  const upstreamName = upstream.split('/')[1] ?? 'layerbench';

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        aria-label={
          remote ? `Storage: this browser and GitHub (@${login})` : 'Storage: this browser only'
        }
        onClick={() => dialog.current?.showModal()}
      >
        Storage{remote ? ' ✓' : ''}
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
                : ' Sign in with GitHub to keep them in your account as well, so they follow you to other browsers: in your fork of layerbench when you have one, in secret gists otherwise.'}
          </p>

          {(status === 'signed-out' || status === 'unknown') && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={status === 'unknown'}
              onClick={signIn}
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

              {/* Announced, so a change of destination is not only visible. */}
              <div aria-live="polite" className="space-y-2">
                {target && <Where target={target} login={login} />}
                {targetStatus === 'checking' && (
                  <p className="text-xs opacity-70">Looking for your fork…</p>
                )}
                {targetStatus === 'error' && (
                  <p className="text-xs text-error">
                    GitHub could not be asked where to save
                    {target ? '; saving where it last said' : '; saving in this browser only'}.
                  </p>
                )}
              </div>

              {/* Also while the fork cannot be looked up: giving access is how that gets fixed. */}
              {target?.kind !== 'repo' && appSlug && (
                <p className="text-xs">
                  {target?.forkWithoutAccess ? (
                    <>
                      Your fork <span className="font-mono">{target.forkWithoutAccess}</span> is not
                      shared with the app yet.
                    </>
                  ) : (
                    <>Have a fork of {upstreamName}?</>
                  )}{' '}
                  <a
                    className="link"
                    href={`https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Give LayerBench access to it
                  </a>{' '}
                  to save there instead.
                </p>
              )}

              <div className="flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-1">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!target || copying}
                  onClick={() => void copyUp()}
                >
                  {copying ? 'Copying…' : "Copy this browser's documents up"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={targetStatus === 'checking'}
                  onClick={() => void detectTarget()}
                >
                  Check again
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
