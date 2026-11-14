import { HEAT_LABELS } from '../engine/heat.js';
import { HEAT_MODES, type HeatMode } from '../url/params.js';

/**
 * The Heat choice, what a board's colour measures, as Analyze, the Library and Compare each offer it:
 * the five modes, usage first, under the name Heat. `id` keeps each page's own.
 */
export function HeatSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: HeatMode;
  onChange: (mode: HeatMode) => void;
}) {
  return (
    <>
      <label className="label-text text-xs" htmlFor={id}>
        Heat
      </label>
      <select
        id={id}
        name={id}
        className="select select-xs select-bordered w-auto"
        value={value}
        onChange={(e) => onChange(e.target.value as HeatMode)}
      >
        {HEAT_MODES.map((m) => (
          <option key={m} value={m}>
            {HEAT_LABELS[m]}
          </option>
        ))}
      </select>
    </>
  );
}
