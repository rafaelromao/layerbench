import { humanBand, type RuleResult } from '@layoutmaster/core';
import { formatItem, formatValue, qualityBadge, qualityBorder, shortLabel } from './format.js';

/** The metrics shown above the fold, in the order the reference application uses. */
export const SUMMARY_IDS = [
  'sfb',
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

/** The reduced set the editor shows, where space is tighter. */
export const EDIT_SUMMARY_IDS = [
  'sfb',
  'sfs',
  'lsb',
  'fsb',
  'alternation',
  'rolls',
  'redirect',
  'pinky_off',
  'layer_taps_per_100',
  'extra_keystrokes',
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
    <ul className="flex flex-wrap gap-2 list-none p-0 m-0" aria-label="Summary metrics">
      {ids.map((id) => {
        const r = byId.get(id);
        if (!r) return null;
        return (
          <li key={id}>
            <button
              type="button"
              title={r.note ?? r.label}
              onClick={() => onSelect?.(id)}
              className={`lm-stat rounded-xl border px-3 py-2 text-left transition hover:border-primary ${qualityBorder(r.band)}`}
            >
              <div className="text-[11px] uppercase tracking-wide opacity-70">
                {shortLabel(r.id, r.label)}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-lg tabular-nums">
                  {formatValue(r.value, r.unit)}
                </span>
                <BandBadge band={r.band} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FingerBars({ values }: { values: Partial<Record<string, number>> }) {
  const max = Math.max(0, ...Object.values(values).map((v) => v ?? 0));
  if (!(max > 0)) return null;
  return (
    <div className="flex items-end gap-1 h-14" role="img" aria-label="Per finger distribution">
      {FINGER_ORDER.map((f) => {
        const v = values[f] ?? 0;
        return (
          <div key={f} className="flex flex-col items-center gap-1 flex-1">
            <div
              className={`w-full rounded-sm bg-primary/70 ${f === 'LT' || f === 'RT' ? 'opacity-70' : ''}`}
              style={{ height: `${((v / max) * 44).toFixed(1)}px` }}
              title={`${f}: ${v.toFixed(2)}%`}
            />
            <span className="text-[9px] font-mono opacity-60">{f}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MetricCard({
  result,
  selectedItem,
  onHighlightItem,
}: {
  result: RuleResult;
  selectedItem?: number | null;
  onHighlightItem?: (ruleId: string, index: number) => void;
}) {
  const hasFingers = Object.keys(result.per_finger).length > 0;
  const hands = Object.entries(result.per_hand).sort(([a], [b]) => a.localeCompare(b));
  const breakdown = Object.entries(result.breakdown).slice(0, 12);
  const maxItem = Math.max(0, ...result.items.map((i) => i.percent ?? i.count ?? 0));

  return (
    <section
      id={`metric-${result.id}`}
      className={`lm-card card bg-base-100 border shadow-sm ${qualityBorder(result.band)}`}
    >
      <div className="card-body gap-3 p-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">{result.label}</h3>
            {result.note && <p className="text-xs opacity-60">{result.note}</p>}
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-xl tabular-nums">
              {formatValue(result.value, result.unit)}
            </div>
            <BandBadge band={result.band} />
          </div>
        </header>

        {hasFingers && <FingerBars values={result.per_finger} />}

        {hands.length > 0 && (
          <div className="flex gap-3 text-xs opacity-70 font-mono">
            {hands.map(([hand, v]) => (
              <span key={hand}>
                {hand}: {v.toFixed(1)}%
              </span>
            ))}
          </div>
        )}

        {!hasFingers && breakdown.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono opacity-70">
            {breakdown.map(([k, v]) => (
              <span key={k}>
                {k}: {v.toFixed(2)}
              </span>
            ))}
          </div>
        )}

        {result.items.length > 0 && (
          <ol className="lm-items space-y-1">
            {result.items.map((item, i) => {
              const v = item.percent ?? item.count ?? 0;
              const width = maxItem > 0 ? (v / maxItem) * 100 : 0;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: rank is the identity of a row
                <li key={`${item.label}-${i}`} className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    title={item.label}
                    onClick={() => onHighlightItem?.(result.id, i)}
                    className={`font-mono w-16 truncate text-left ${
                      selectedItem === i ? 'text-primary font-bold' : ''
                    }`}
                  >
                    {item.label}
                  </button>
                  <div className="flex-1 h-1.5 rounded bg-base-200 overflow-hidden">
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
      </div>
    </section>
  );
}
