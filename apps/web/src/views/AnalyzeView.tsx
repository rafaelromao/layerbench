import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAnalysisClient } from '../engine/client-context.js';
import { useRememberSelection } from '../state/selection.js';
import { useStorage } from '../storage/use-storage.js';
import {
  DEFAULT_PARAMS,
  type Params,
  parseParams,
  type RawSearch,
  toSearch,
} from '../url/params.js';
import { Workbench } from './analyze/Workbench.js';
import { useCorpora } from './useCorpora.js';
import { useLayout } from './useLayout.js';
import { useRuleSet } from './useRuleSet.js';

/**
 * Analyze, where a layout is also edited. The link names the layout; the workbench opens it once and
 * then owns it, writing each unsaved version back into the link as an inline layout. A reference it
 * wrote itself does not open the layout again — that would lose the editor's history — but any
 * other one does: following a link, going back, picking another layout.
 */
export function AnalyzeView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const storage = useStorage();
  const corpora = useCorpora();
  const params = useMemo(() => parseParams(search), [search]);
  useRememberSelection(params);
  const ruleSet = useRuleSet(params.preset, params.universe);

  /** The layout open, and how many times one was opened, which tells one workbench from the next. */
  const opened = useRef({ ref: params.layoutRef, epoch: 0 });
  /** References the open workbench wrote into the link. */
  const claimed = useRef(new Set<string>());
  const [, reopen] = useState(0);
  if (params.layoutRef !== opened.current.ref && !claimed.current.has(params.layoutRef)) {
    opened.current = { ref: params.layoutRef, epoch: opened.current.epoch + 1 };
    claimed.current = new Set();
  }

  // Settings are written onto whatever the link holds by then, so they never undo a layout the
  // workbench has just written into it.
  const setParams = useCallback(
    (overrides: Partial<Params>) => {
      navigate({
        to: '/analyze',
        search: ((prev: RawSearch) => toSearch(parseParams(prev), overrides)) as never,
        replace: true,
      });
    },
    [navigate],
  );
  const claim = useCallback((ref: string) => {
    claimed.current.add(ref);
  }, []);
  const open = useCallback(
    (ref: string) => {
      // The same layout picked again opens afresh, as it was stored.
      opened.current = { ref, epoch: opened.current.epoch + 1 };
      claimed.current = new Set();
      navigate({
        to: '/analyze',
        search: toSearch(params, { layoutRef: ref, layer: DEFAULT_PARAMS.layer }) as never,
        replace: true,
      });
      reopen((n) => n + 1);
    },
    [navigate, params],
  );

  const loaded = useLayout(opened.current.ref);
  const ready = loaded.ref === opened.current.ref && loaded.layout && loaded.compiled;

  return ready && loaded.layout && loaded.compiled ? (
    <Workbench
      key={opened.current.epoch}
      initialLayout={loaded.layout}
      initialCompiled={loaded.compiled}
      openedRef={opened.current.ref}
      params={params}
      setParams={setParams}
      claim={claim}
      open={open}
      ruleSet={ruleSet}
      corpora={corpora}
      client={client}
      storage={storage}
      navigate={navigate}
    />
  ) : (
    <div className="space-y-4">
      <h1 className="sr-only">Analyze</h1>
      {loaded.ref === opened.current.ref && loaded.error ? (
        <div className="alert alert-error text-sm">{loaded.error}</div>
      ) : (
        <span className="loading loading-dots loading-md" />
      )}
    </div>
  );
}

export { DEFAULT_PARAMS };
