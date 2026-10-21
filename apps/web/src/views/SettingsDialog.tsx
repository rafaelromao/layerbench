import type { CorpusManifest, TextClass } from '@layerbench/core';
import { type ReactNode, useId, useRef } from 'react';
import { featureList } from '../components/FeatureSwitches.js';
import { sampleLabel } from './AnalysisSelects.js';
import { textName } from './text-of.js';
import type { AnalysisSettingsState } from './useAnalysisSettings.js';

const COUNTS: Record<TextClass, string> = {
  letters: 'letters only',
  'letters+digits': 'letters and numbers',
  'letters+digits+symbols': 'letters, numbers and symbols',
};

/** What an analysis is made with, in a line: the text, the rules, what counts and what is off. */
export function settingsSummary(
  { linked: settings, rulesName }: AnalysisSettingsState,
  corpora: CorpusManifest[],
): string {
  const parts = [
    textName(settings, corpora),
    rulesName,
    COUNTS[settings.textClass],
    sampleLabel(settings.sample),
  ];
  if (settings.universe === 'with_space') parts.push('with space');
  if (settings.caseMode === 'model') parts.push('with shift');
  if (settings.without.length > 0) parts.push(`without ${featureList(settings.without)}`);
  return parts.join(' · ');
}

/** The gear a settings button shows in place of its words. */
function Gear({ className = '' }: { className?: string }) {
  return (
    <span className={`text-xl leading-none ${className}`} aria-hidden="true">
      {/* Text presentation, so no phone draws it as a coloured emoji. */}
      {'\u2699\uFE0E'}
    </span>
  );
}

/**
 * The choices behind a view's numbers, in a dialog of their own so the bar keeps to the layouts:
 * a button, and beside it a line that says what is chosen, so nothing is hidden by being tucked
 * away. Analyze and Compare call it Settings; the Library, which filters with it too, Rank and
 * filter, shows it as a gear, and says what is left out on a line of its own.
 */
export function SettingsDialog({
  title = 'Settings',
  buttonLabel = title,
  summary,
  compact = false,
  icon = false,
  children,
}: {
  /** The dialog's heading. */
  title?: string;
  /** What the button that opens it says; the title when absent. */
  buttonLabel?: string;
  summary?: string;
  /** On a phone, a gear and no summary, for a bar that must keep to one line there. */
  compact?: boolean;
  /** A gear at every width, its words left to its name and tooltip. */
  icon?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const square = icon ? 'btn-square' : compact ? 'max-sm:btn-square' : '';
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        className={`btn btn-sm shrink-0 ${square}`}
        onClick={() => dialog.current?.showModal()}
      >
        {icon ? (
          <Gear />
        ) : compact ? (
          <>
            <Gear className="sm:hidden" />
            <span className="max-sm:hidden">{buttonLabel}</span>
          </>
        ) : (
          buttonLabel
        )}
      </button>
      {summary !== undefined && (
        <span
          className={`text-xs opacity-70 min-w-0 line-clamp-2 ${compact ? 'max-sm:hidden' : ''}`}
        >
          {summary}
        </span>
      )}

      <dialog ref={dialog} className="modal" aria-labelledby={heading}>
        <div className="modal-box max-w-2xl space-y-4">
          <h2 id={heading} className="font-semibold text-base">
            {title}
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
