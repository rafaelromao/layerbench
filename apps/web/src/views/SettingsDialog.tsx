import { type CorpusManifest, getPreset, type TextClass } from '@layerbench/core';
import { type ReactNode, useId, useRef } from 'react';
import { featureList } from '../components/FeatureSwitches.js';
import type { Params } from '../url/params.js';
import { sampleLabel } from './AnalysisSelects.js';

const COUNTS: Record<TextClass, string> = {
  letters: 'letters only',
  'letters+digits': 'letters and numbers',
  'letters+digits+symbols': 'letters, numbers and symbols',
};

/** What an analysis is made with, in a line: the text, the rules, what counts and what is off. */
export function settingsSummary(
  params: Params,
  corpora: CorpusManifest[],
  ruleSetName?: string,
): string {
  const name = (id: string) => corpora.find((c) => c.id === id)?.name ?? id;
  const parts = [
    params.corpus2
      ? `${name(params.corpus)} ${params.mix}% with ${name(params.corpus2)}`
      : name(params.corpus),
    params.preset.startsWith('saved:')
      ? (ruleSetName ?? params.preset)
      : getPreset(params.preset).name,
    COUNTS[params.textClass],
    sampleLabel(params.sample),
  ];
  if (params.universe === 'with_space') parts.push('with space');
  if (params.caseMode === 'model') parts.push('with shift');
  if (params.without.length > 0) parts.push(`without ${featureList(params.without)}`);
  return parts.join(' · ');
}

/**
 * The choices behind a view's numbers, in a dialog of their own so the bar keeps to the layouts:
 * a button, and beside it a line that says what is chosen, so nothing is hidden by being tucked
 * away.
 */
export function SettingsDialog({ summary, children }: { summary: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        className="btn btn-sm shrink-0"
        onClick={() => dialog.current?.showModal()}
      >
        Settings
      </button>
      <span className="text-xs opacity-70 min-w-0 line-clamp-2">{summary}</span>

      <dialog ref={dialog} className="modal" aria-labelledby={title}>
        <div className="modal-box max-w-2xl space-y-4">
          <h2 id={title} className="font-semibold text-base">
            Settings
          </h2>
          {children}
          <div className="modal-action">
            <button type="button" className="btn btn-sm" onClick={() => dialog.current?.close()}>
              Done
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </div>
  );
}
