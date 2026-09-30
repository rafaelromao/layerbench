import { useCallback, useRef, useState } from 'react';
import { gitHubReady, useSession } from '../state/session.js';
import { toast } from '../state/toasts.js';
import { CompositeStorage } from './composite.js';
import { GitHubAdapter } from './github.js';
import { IndexedDbAdapter } from './indexeddb.js';

/**
 * Where saved documents live. Layouts, rule sets and corpora are always kept in this browser;
 * a repository you own can hold them too, so they follow you between machines.
 */
export function StorageSettings() {
  const dialog = useRef<HTMLDialogElement>(null);
  const github = useSession((s) => s.github);
  const token = useSession((s) => s.githubToken);
  const setGitHub = useSession((s) => s.setGitHub);
  const setToken = useSession((s) => s.setGitHubToken);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    setStatus(null);
    const adapter = new GitHubAdapter({ ...github, token });
    const result = await adapter.check();
    setChecking(false);
    setStatus(
      result.ok
        ? `Connected. ${result.rateLimitRemaining ?? 'many'} requests left this hour.`
        : `Not connected: ${result.error}.`,
    );
  }, [github, token]);

  const copyUp = useCallback(async () => {
    const composite = new CompositeStorage(
      new IndexedDbAdapter(),
      new GitHubAdapter({ ...github, token }),
    );
    try {
      let total = 0;
      for (const collection of ['layouts', 'rulesets', 'corpora'] as const) {
        total += await composite.pushAll(collection);
      }
      toast.info(`Copied ${total} document${total === 1 ? '' : 's'} to ${github.repo}`);
    } catch (e) {
      toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [github, token]);

  const ready = gitHubReady({ github, githubToken: token });

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        aria-label={ready ? 'Storage: this browser and a repository' : 'Storage: this browser only'}
        onClick={() => dialog.current?.showModal()}
      >
        Storage{ready ? ' ✓' : ''}
      </button>

      <dialog ref={dialog} className="modal" aria-labelledby="storage-settings-title">
        <div className="modal-box max-w-lg">
          <h2 id="storage-settings-title" className="font-semibold text-base mb-2">
            Storage
          </h2>
          <p className="text-xs opacity-70 mb-3">
            Your layouts, rule sets and corpora are saved in this browser. To keep them in a
            repository you own as well, give this page a fine-grained personal access token scoped
            to that one repository, with read and write access to its contents. The token stays in
            this browser and is sent to GitHub and nowhere else.
          </p>

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void check();
            }}
          >
            <label className="form-control">
              <span className="label-text text-xs">Repository (owner/name)</span>
              <input
                aria-label="Repository"
                placeholder="you/keyboard-data"
                className="input input-sm input-bordered font-mono"
                value={github.repo}
                onChange={(e) => setGitHub({ repo: e.target.value })}
              />
            </label>

            <div className="flex gap-2">
              <label className="form-control flex-1">
                <span className="label-text text-xs">Branch</span>
                <input
                  aria-label="Branch"
                  className="input input-sm input-bordered font-mono"
                  value={github.branch}
                  onChange={(e) => setGitHub({ branch: e.target.value })}
                />
              </label>
              <label className="form-control flex-1">
                <span className="label-text text-xs">Directory</span>
                <input
                  aria-label="Directory"
                  className="input input-sm input-bordered font-mono"
                  value={github.path}
                  onChange={(e) => setGitHub({ path: e.target.value })}
                />
              </label>
            </div>

            <label className="form-control">
              <span className="label-text text-xs">Token</span>
              <input
                type="password"
                aria-label="Access token"
                autoComplete="off"
                placeholder="github_pat_…"
                className="input input-sm input-bordered font-mono"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>

            <label className="label cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                aria-label="Use the repository"
                className="toggle toggle-sm"
                checked={github.enabled}
                onChange={(e) => setGitHub({ enabled: e.target.checked })}
              />
              <span className="label-text text-xs">Keep documents in this repository too</span>
            </label>

            {/* Announced, so the result of a connection test is not only visible. */}
            <p className="text-xs opacity-80" aria-live="polite">
              {status}
            </p>

            <div className="flex flex-wrap gap-2 pt-1 max-sm:grid max-sm:grid-cols-1">
              <button type="submit" className="btn btn-sm" disabled={checking || !token}>
                {checking ? 'Checking…' : 'Test connection'}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!ready}
                onClick={() => void copyUp()}
              >
                Copy this browser's documents up
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setToken('');
                  setStatus(null);
                }}
              >
                Forget token
              </button>
            </div>
          </form>

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
