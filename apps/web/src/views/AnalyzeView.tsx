import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { ErrorAlert } from '../components/ErrorAlert.js';
import { StillWorking } from '../components/StillWorking.js';
import { customId } from '../custom/ref.js';
import { useAnalysisClient } from '../engine/client-context.js';
import { useLayoutSession } from '../layout-session/use-layout-session.js';
import { useCarried, useRememberSelection } from '../state/selection.js';
import { portableCorpusError } from '../url/corpus-share.js';
import {
  DEFAULT_PARAMS,
  type Params,
  parseParams,
  type RawSearch,
  settingsOf,
  toSearch,
} from '../url/params.js';
import { parsePortableSearch } from '../url/share-target.js';
import { Workbench } from './analyze/Workbench.js';
import { useAnalysisSettings } from './useAnalysisSettings.js';
import { useCorporaState } from './useCorpora.js';

/**
 * Analyze, where a layout is also edited. The link names the layout; the layout session opens it and
 * keeps the link holding it as it is edited. A reference the session wrote itself does not open the
 * layout again — that would lose the editor's history — but any other one does: following a link,
 * going back, picking another layout.
 */
export function AnalyzeView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const portable = parsePortableSearch('analyze', search);
  if (portable && !portable.ok) return <ErrorAlert message={portable.error} />;
  return <AnalyzePage search={portable?.ok ? portable.search : search} />;
}

function AnalyzePage({ search }: { search: RawSearch }) {
  const { corpora, loaded } = useCorporaState();
  const params = useMemo(() => parseParams(search), [search]);
  if (search.share === '1') {
    if (!loaded)
      return (
        <div role="status" className="flex items-center gap-2 py-4 text-sm">
          <span className="loading loading-dots loading-xs" />
          Checking the shared corpus…
        </div>
      );
    const error = portableCorpusError(params.corpus, params.corpus2, corpora);
    if (error) return <ErrorAlert message={error} />;
  }
  return <AnalyzeWorkbench search={search} corpora={corpora} corporaLoaded={loaded} />;
}

function AnalyzeWorkbench({
  search,
  corpora,
  corporaLoaded,
}: {
  search: RawSearch;
  corpora: ReturnType<typeof useCorporaState>['corpora'];
  corporaLoaded: boolean;
}) {
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const params = useMemo(() => parseParams(search), [search]);
  useRememberSelection(params);
  const settings = useAnalysisSettings(
    settingsOf(params),
    search.share === '1' ? search.rulesSnapshot : undefined,
  );
  const session = useLayoutSession();
  const carried = useCarried();

  // Settings are written onto whatever the link holds by then, so they never undo a layout the
  // session has just written into it.
  const setParams = useCallback(
    (overrides: Partial<Params>) => {
      navigate({
        to: '/analyze',
        search: ((prev: RawSearch) => {
          const previous = parseParams(prev);
          const next = toSearch(previous, overrides);
          const canStayPortable =
            customId(next.layout ?? '') === null &&
            customId(next.corpus ?? '') === null &&
            customId(next.corpus2 ?? '') === null &&
            (!corporaLoaded ||
              portableCorpusError(next.corpus ?? previous.corpus, next.corpus2 ?? null, corpora) ===
                null);
          if (
            prev.share === '1' &&
            canStayPortable &&
            (overrides.preset === undefined || overrides.preset === previous.preset)
          )
            return {
              ...next,
              share: '1',
              ...(prev.rulesSnapshot && customId(next.rules ?? '') !== null
                ? { rulesSnapshot: prev.rulesSnapshot }
                : {}),
            };
          return next;
        }) as never,
        replace: true,
        // The same view, written again: the page stays where it was scrolled to.
        resetScroll: false,
      });
    },
    [corpora, corporaLoaded, navigate],
  );

  return session.status === 'open' ? (
    <Workbench
      key={session.opening}
      session={session}
      params={params}
      setParams={setParams}
      settings={settings}
      corpora={corpora}
      corporaLoaded={corporaLoaded}
      client={client}
      navigate={navigate}
    />
  ) : (
    <div className="space-y-4">
      <h1 className="sr-only">Analyze</h1>
      {session.status === 'failed' ? (
        // A layout that will not open leaves the way to every other one: the page is never only
        // the error.
        <div role="alert" className="alert alert-error text-sm flex flex-col items-start gap-2">
          <p className="font-semibold">This layout cannot be opened.</p>
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">{session.error}</p>
          <Link to="/library" search={carried() as never} className="btn btn-sm">
            Open another layout
          </Link>
        </div>
      ) : (
        <>
          <span className="loading loading-dots loading-md" />
          <StillWorking after={10_000}>
            This layout is taking longer than it should to open. If LayerBench is open in another
            tab, close that tab, then reload.
          </StillWorking>
        </>
      )}
    </div>
  );
}

export { DEFAULT_PARAMS };
