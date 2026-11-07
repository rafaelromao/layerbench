import { HelpLink } from '../../components/HelpLink.js';
import { HEAT_LABELS } from '../../engine/heat.js';
import { HELP } from '../../guide/help.js';
import { HEAT_MODES, type HeatMode } from '../../url/params.js';

/**
 * Whether the cards' boards are coloured by heat, and by which: a button that stays pressed while
 * they are, and the same Heat choice Analyze has, there only while the heat is on. Both are always
 * in view, beside the sort, as the other choices about how the list is looked at are.
 */
export function HeatControls({
  on,
  mode,
  onToggle,
  onMode,
}: {
  on: boolean;
  mode: HeatMode;
  onToggle: (on: boolean) => void;
  onMode: (mode: HeatMode) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={on}
        className={`btn btn-xs ${on ? 'btn-primary' : ''}`}
        onClick={() => onToggle(!on)}
      >
        Heatmaps
      </button>
      {on && (
        <>
          <label className="label-text text-xs" htmlFor="library-heat">
            Heat
          </label>
          <select
            id="library-heat"
            name="library-heat"
            className="select select-xs select-bordered w-auto"
            value={mode}
            onChange={(e) => onMode(e.target.value as HeatMode)}
          >
            {HEAT_MODES.map((m) => (
              <option key={m} value={m}>
                {HEAT_LABELS[m]}
              </option>
            ))}
          </select>
        </>
      )}
      <HelpLink help={HELP.heat} />
    </div>
  );
}
