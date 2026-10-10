import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useAnalysisClient } from '../engine/client-context.js';
import { useLayoutSession } from '../layout-session/use-layout-session.js';
import { useRememberSelection } from '../state/selection.js';
import {
  DEFAULT_PARAMS,
  type Params,
  parseParams,
  type RawSearch,
  settingsOf,
  toSearch,
} from '../url/params.js';
import { Workbench } from './analyze/Workbench.js';
import { useAnalysisSettings } from './useAnalysisSettings.js';
import { useCorpora } from './useCorpora.js';

/**
 * Analyze, where a layout is also edited. The link names the layout; the layout session opens it and
 * keeps the link holding it as it is edited. A reference the session wrote itself does not open the
 * layout again — that would lose the editor's history — but any other one does: following a link,
 * going back, picking another layout.
 */
export function AnalyzeView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const corpora = useCorpora();
  const params = useMemo(() => parseParams(search), [search]);
  useRememberSelection(params);
  const settings = useAnalysisSettings(settingsOf(params));
  const session = useLayoutSession();

  // Settings are written onto whatever the link holds by then, so they never undo a layout the
  // session has just written into it.
  const setParams = useCallback(
    (overrides: Partial<Params>) => {
      navigate({
        to: '/analyze',
        search: ((prev: RawSearch) => toSearch(parseParams(prev), overrides)) as never,
        replace: true,
        // The same view, written again: the page stays where it was scrolled to.
        resetScroll: false,
      });
    },
    [navigate],
  );

  return session.status === 'open' ? (
    <Workbench
      key={session.opening}
      session={session}
      params={params}
      setParams={setParams}
      settings={settings}
      corpora={corpora}
      client={client}
      navigate={navigate}
    />
  ) : (
    <div className="space-y-4">
      <h1 className="sr-only">Analyze</h1>
      {session.status === 'failed' ? (
        <div className="alert alert-error text-sm">{session.error}</div>
      ) : (
        <span className="loading loading-dots loading-md" />
      )}
    </div>
  );
}

export { DEFAULT_PARAMS };
