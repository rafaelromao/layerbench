import { Link } from '@tanstack/react-router';
import { safeErrorMessage } from '../auth/github-session.js';
import { Shell } from './Shell.js';

export function NotFoundScreen() {
  return (
    <section
      aria-labelledby="not-found-title"
      className="lb-route-screen card bg-base-100 p-4 sm:p-6"
    >
      <h1 id="not-found-title" className="text-2xl font-semibold">
        Page not found
      </h1>
      <p className="max-w-prose">
        We could not find that page. Check the address or return to the Library.
      </p>
      <Link to="/library" className="btn btn-primary mt-2 self-start">
        Back to the Library
      </Link>
    </section>
  );
}

export function RouteLoadingScreen() {
  return (
    <p role="status" className="lb-route-screen card bg-base-100 p-4 sm:p-6">
      Loading view…
    </p>
  );
}

export function RouteErrorScreen({ error }: { error: unknown }) {
  return (
    <Shell>
      <section
        aria-labelledby="route-error-title"
        className="lb-route-screen card bg-base-100 p-4 sm:p-6"
      >
        <h1 id="route-error-title" className="text-2xl font-semibold">
          This page could not be loaded
        </h1>
        <p>Something went wrong while loading this view.</p>
        <p className="lb-route-error-message" role="alert">
          {safeErrorMessage(error)}
        </p>
        <div className="flex min-w-0 flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <Link to="/library" className="btn btn-outline">
            Back to the Library
          </Link>
          <a
            className="btn btn-outline"
            href="https://github.com/rafaelromao/layerbench/issues/new"
            target="_blank"
            rel="noreferrer"
          >
            Open an issue
          </a>
        </div>
      </section>
    </Shell>
  );
}
