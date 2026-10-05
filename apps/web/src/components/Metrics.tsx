import { humanBand, type RuleResult } from '@layoutmaster/core';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { formatItem, formatValue, qualityBadge, qualityBorder, shortLabel } from './format.js';
import { RuleSources } from './RuleSources.js';

/**
 * The two numbers a layout is judged by first, and sorted by wherever layouts are listed: overall
 * effort as cyanophage computes it, and same-finger bigrams.
 */
export const HEADLINE_IDS = ['effort', 'sfb'] as const;

/** The metrics shown above the fold: the headline pair, then the reference application's order. */
export const SUMMARY_IDS = [
  ...HEADLINE_IDS,
  'sfs',
  'lsb',
  'fsb',
  'hsb',
  'alternation',
  'rolls',
  'onehand_in',
  'redirect',
  'pinky_off',
  'hand_balance',
  'layer_taps_per_100',
  'extra_keystrokes',
];

/** The numbers a selected key shows its part of first; the rest are one tap away. */
export const KEY_STATS_IDS = [
  ...HEADLINE_IDS,
  'sfs',
  'lsb',
  'fsb',
  'hsb',
  'alternation',
  'rolls',
  'redirect',
  'pinky_off',
  'finger_travel',
  'layer_taps_per_100',
];

const FINGER_ORDER = ['LP', 'LR', 'LM', 'LI', 'LT', 'RT', 'RI', 'RM', 'RR', 'RP'] as const;

export function BandBadge({ band }: { band: RuleResult['band'] }) {
  if (!band.label) return null;
  return (
    <span className={`lm-band badge badge-xs ${qualityBadge(band)}`}>{humanBand(band.label)}</span>
  );
}

export function SummaryStrip({
  results,
  ids = SUMMARY_IDS,
  onSelect,
}: {
  results: RuleResult[];
  ids?: string[];
  onSelect?: (id: string) => void;
}) {
  const byId = new Map(results.map((r) => [r.id, r]));
  return (
    // Every number in a box of the same width, so the strip reads as a table rather than a pile.
    <ul className="lm-stats" aria-label="Summary metrics">
      {ids.map((id) => {
        const r = byId.get(id);
        if (!r) return null;
        const body = (
          <>
            <span className="lm-stat-label">{shortLabel(r.id, r.label)}</span>
            <span className="lm-stat-value">{formatValue(r.value, r.unit)}</span>
            <BandBadge band={r.band} />
          </>
        );
        const look = `lm-stat ${qualityBorder(r.band)}`;
        return (
          <li key={id}>
            {/* A card that leads nowhere is not a button: it would be a tab stop that does nothing. */}
            {onSelect ? (
              <button
                type="button"
                title={r.note ?? r.label}
                onClick={() => onSelect(id)}
                className={`${look} transition hover:border-primary`}
              >
                {body}
              </button>
            ) : (
              <div title={r.note ?? r.label} className={look}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FingerBars({
  values,
  tall = false,
}: {
  values: Partial<Record<string, number>>;
  /** Drawn at twice the height, for a card shown enlarged. */
  tall?: boolean;
}) {
  const max = Math.max(0, ...Object.values(values).map((v) => v ?? 0));
  if (!(max > 0)) return null;
  return (
    <div
      className={`flex items-end gap-1 ${tall ? 'h-28' : 'h-14'}`}
      role="img"
      aria-label="Per finger distribution"
    >
      {FINGER_ORDER.map((f) => {
        const v = values[f] ?? 0;
        return (
          <div key={f} className="flex flex-col items-center gap-1 flex-1">
            <div
              className={`w-full rounded-sm bg-primary/70 ${f === 'LT' || f === 'RT' ? 'opacity-70' : ''}`}
              style={{ height: `${((v / max) * (tall ? 96 : 44)).toFixed(1)}px` }}
              title={`${f}: ${v.toFixed(2)}%`}
            />
            <span className={`font-mono opacity-60 ${tall ? 'text-xs' : 'text-[9px]'}`}>{f}</span>
          </div>
        );
      })}
    </div>
  );
}

interface MetricProps {
  result: RuleResult;
  selectedItem?: number | null;
  onHighlightItem?: (ruleId: string, index: number) => void;
  /** The preset in force, whose own definition of a rule is then cited first. */
  presetId?: string;
}

/** A click on a control inside a card is the control's own; anywhere else it enlarges the card. */
const onControl = (e: MouseEvent) =>
  (e.target as HTMLElement).closest('button, a, summary, details, input, select, label') !== null;

/**
 * One rule's result as a card. A click on the card, away from its controls, shows it enlarged in a
 * popup: the bars twice as tall, item labels in full, the text a size up.
 */
export function MetricCard(props: MetricProps) {
  const { result } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  // The enlarged copy is drawn only while it is open, so the page holds each card once.
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open || dialog.current?.open) return;
    dialog.current?.showModal();
    // Opening on Close, not on the first row, which would read as picked.
    close.current?.focus();
  }, [open]);
  const titleId = `metric-${result.id}-enlarged-title`;
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: a click anywhere is a shortcut; the keyboard has the Enlarge button in the header. */}
      <section
        id={`metric-${result.id}`}
        className={`lm-card card bg-base-100 border shadow-sm cursor-zoom-in ${qualityBorder(result.band)}`}
        onClick={(e) => {
          if (!onControl(e)) setOpen(true);
        }}
      >
        <div className="card-body gap-3 p-4">
          <MetricBody {...props} onEnlarge={() => setOpen(true)} />
        </div>
      </section>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
      >
        {open && (
          <div
            className={`modal-box max-w-3xl border ${qualityBorder(result.band)} flex flex-col gap-4`}
          >
            <MetricBody {...props} large titleId={titleId} />
            <div className="modal-action mt-0">
              <button
                ref={close}
                type="button"
                className="btn btn-sm"
                onClick={() => dialog.current?.close()}
              >
                Close
              </button>
            </div>
          </div>
        )}
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  );
}

function MetricBody({
  result,
  selectedItem,
  onHighlightItem,
  presetId,
  large = false,
  titleId,
  onEnlarge,
}: MetricProps & { large?: boolean; titleId?: string; onEnlarge?: () => void }) {
  const hasFingers = Object.keys(result.per_finger).length > 0;
  const hands = Object.entries(result.per_hand).sort(([a], [b]) => a.localeCompare(b));
  const breakdown = Object.entries(result.breakdown).slice(0, large ? undefined : 12);
  const maxItem = Math.max(0, ...result.items.map((i) => i.percent ?? i.count ?? 0));
  const text = large ? 'text-sm' : 'text-xs';

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className={`font-semibold ${large ? 'text-lg' : 'text-sm'}`}>
            {result.label}
          </h3>
          {result.note && <p className={`${text} opacity-60`}>{result.note}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className={`font-mono tabular-nums ${large ? 'text-3xl' : 'text-xl'}`}>
            {formatValue(result.value, result.unit)}
          </div>
          <BandBadge band={result.band} />
        </div>
        {onEnlarge && (
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square -mr-2 -mt-1 opacity-60"
            aria-label={`Enlarge ${result.label}`}
            title="Enlarge"
            onClick={onEnlarge}
          >
            ⤢
          </button>
        )}
      </header>

      {hasFingers && <FingerBars values={result.per_finger} tall={large} />}

      {hands.length > 0 && (
        <div className={`flex gap-3 ${text} opacity-70 font-mono`}>
          {hands.map(([hand, v]) => (
            <span key={hand}>
              {hand}: {v.toFixed(1)}%
            </span>
          ))}
        </div>
      )}

      {!hasFingers && breakdown.length > 0 && (
        <div className={`flex flex-wrap gap-x-3 gap-y-1 ${text} font-mono opacity-70`}>
          {breakdown.map(([k, v]) => (
            <span key={k}>
              {k}: {v.toFixed(2)}
            </span>
          ))}
        </div>
      )}

      {result.items.length > 0 && (
        <ol className={`lm-items space-y-1 ${large ? 'lm-items-large' : ''}`}>
          {result.items.map((item, i) => {
            const v = item.percent ?? item.count ?? 0;
            const width = maxItem > 0 ? (v / maxItem) * 100 : 0;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: rank is the identity of a row
              <li key={`${item.label}-${i}`} className={`flex items-center gap-2 ${text}`}>
                <button
                  type="button"
                  title={
                    item.then ? `${item.label}: what its last key was pressed for` : item.label
                  }
                  // A pair ending on a layer key opens what that key was pressed for.
                  aria-haspopup={item.then ? 'dialog' : undefined}
                  onClick={() => onHighlightItem?.(result.id, i)}
                  className={`font-mono text-left ${large ? 'w-48 break-words' : 'w-16 truncate'} ${
                    item.then ? 'underline decoration-dotted underline-offset-2' : ''
                  } ${selectedItem === i ? 'text-primary font-bold' : ''}`}
                >
                  {item.label}
                </button>
                <div
                  className={`flex-1 rounded bg-base-200 overflow-hidden ${large ? 'h-2.5' : 'h-1.5'}`}
                >
                  <div className="h-full bg-primary/60" style={{ width: `${width}%` }} />
                </div>
                <span className="font-mono tabular-nums opacity-70 w-16 text-right">
                  {formatItem(item)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <RuleSources ruleId={result.id} presetId={presetId} />
    </>
  );
}
