import { HEAT_LABELS } from '../engine/heat.js';
import type { HeatMode } from '../url/params.js';

/** What each mode measures on a key, in the words the guide uses for it. */
const HEAT_MEANING: Record<HeatMode, string> = {
  usage: 'how often the key is pressed',
  sfb: 'its part of the same-finger pairs',
  effort: 'its cost times its presses',
  travel: 'the distance its finger moved to press it',
  layer_taps: 'how often it is tapped to reach a layer',
};

/**
 * What the colours of a heat map mean: the scale, in the board's own mix of the plain key and the
 * heat colour, and in words what it measures and that each layer is scaled against its own busiest
 * key, so colour is read within one board. The scale is for the eye; the words and each key's
 * tooltip carry the same to everyone else.
 */
export function HeatLegend({
  mode,
  fallback = false,
}: {
  mode: HeatMode;
  /** The rule set has no rule for the mode, so usage is what is drawn. */
  fallback?: boolean;
}) {
  return (
    <div className="lb-heat-legend flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-80">
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <span>none</span>
        <span
          className="h-2.5 w-16 rounded-box border border-base-300"
          style={{
            background: 'linear-gradient(in oklab to right, var(--lb-key-bg), var(--lb-heat))',
          }}
        />
        <span>busiest key</span>
      </span>
      <p className="min-w-0 [overflow-wrap:anywhere]">
        {fallback
          ? `This rule set has no ${HEAT_LABELS[mode]} rule, so ${HEAT_LABELS.usage}: ${HEAT_MEANING.usage}`
          : `${HEAT_LABELS[mode]}: ${HEAT_MEANING[mode]}`}
        , against the busiest key of its layer. Point at a key for its share.
      </p>
    </div>
  );
}
