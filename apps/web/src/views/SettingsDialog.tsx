import type { AnalysisSettings, CorpusManifest, TextClass } from '@layerbench/core';
import { type ReactNode, useId, useRef } from 'react';
import { featureList } from '../components/FeatureSwitches.js';
import { sampleLabel } from './AnalysisSelects.js';
import { textName } from './text-of.js';

const COUNTS: Record<TextClass, string> = {
  letters: 'letters only',
  'letters+digits': 'letters and numbers',
  'letters+digits+symbols': 'letters, numbers and symbols',
};

/** What an analysis is made with, in a line: the text, the rules, what counts and what is off. */
export function settingsSummary(settings: AnalysisSettings, corpora: CorpusManifest[]): string {
  const parts = [
    textName(settings, corpora),
    settings.rules.name ?? 'Rule set',
    COUNTS[settings.textClass],
    sampleLabel(settings.sample),
  ];
  if (settings.universe === 'with_space') parts.push('with space');
  if (settings.caseMode === 'model') parts.push('with shift');
  if (settings.without.length > 0) parts.push(`without ${featureList(settings.without)}`);
  return parts.join(' · ');
}

/**
 * The choices behind a view's numbers, in a dialog of their own so the bar keeps to the layouts:
 * a button, and beside it a line that says what is chosen, so nothing is hidden by being tucked
 * away.
 */
export function SettingsDialog({
  summary,
  compact = false,
  children,
}: {
  summary: string;
  /** On a phone, a gear and no summary, for a bar that must keep to one line there. */
  compact?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        className={`btn btn-sm shrink-0 ${compact ? 'max-sm:btn-square' : ''}`}
        onClick={() => dialog.current?.showModal()}
      >
        {compact ? (
          <>
            <span className="sm:hidden text-xl leading-none" aria-hidden="true">
              {/* Text presentation, so no phone draws it as a coloured emoji. */}
              {'\u2699\uFE0E'}
            </span>
            <span className="max-sm:hidden">Settings</span>
          </>
        ) : (
          'Settings'
        )}
      </button>
      <span className={`text-xs opacity-70 min-w-0 line-clamp-2 ${compact ? 'max-sm:hidden' : ''}`}>
        {summary}
      </span>

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
