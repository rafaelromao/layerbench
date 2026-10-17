import { FEATURE_KINDS, FEATURE_LABELS, type FeatureKind } from '@layerbench/core';
import { type ReactNode, useEffect, useRef } from 'react';

/** "adaptive keys, typing combos and multi-letter macros". */
export function featureList(features: readonly FeatureKind[]): string {
  const names = features.map((f) => FEATURE_LABELS[f].toLowerCase());
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The box that stands for all of a group's others: how many of them are ticked, and its action. */
export interface AllSwitch {
  shown: number;
  total: number;
  onChange: (on: boolean) => void;
}

/**
 * Checkboxes under a legend, in a grid: two to a line on a phone, three from 640px, so every box of
 * every group lines up with the ones above it. With `all`, an "All" box comes first: ticked when
 * every other one is, and neither ticked nor clear when only some are.
 */
export function SwitchGroup({
  legend,
  help,
  columns = 'grid-cols-2 sm:grid-cols-3',
  className = '',
  all,
  children,
}: {
  legend: string;
  /** Drawn after the legend, such as a link to the guide. */
  help?: ReactNode;
  /** How many to a line at each width, for a group longer or shorter than the usual. */
  columns?: string;
  className?: string;
  all?: AllSwitch;
  children: ReactNode;
}) {
  return (
    // Named by the legend's words alone: the help link inside it would otherwise join the name.
    <fieldset
      aria-label={legend}
      className={`lb-rank-with grid ${columns} items-center gap-x-4 gap-y-1 ${className}`}
    >
      {/* Floated, a legend is laid out as the grid's first row rather than on the border. */}
      <legend className="float-left col-span-full flex items-center gap-2">
        <span className="text-xs opacity-70">{legend}</span>
        {help}
      </legend>
      {all && (
        <Switch
          label="All"
          strong
          checked={all.total > 0 && all.shown === all.total}
          indeterminate={all.shown > 0 && all.shown < all.total}
          onChange={all.onChange}
        />
      )}
      {children}
    </fieldset>
  );
}

/** A checkbox drawn as one of a group's switches. */
export function Switch({
  label,
  name,
  title,
  checked,
  onChange,
  indeterminate = false,
  count,
  strong = false,
}: {
  label: string;
  name?: string;
  /** What it does, for a label one word long. */
  title?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Neither ticked nor clear: some but not all of what it stands for. */
  indeterminate?: boolean;
  /** How many things it stands for, drawn after the label. */
  count?: number;
  /** Drawn bolder, for the one that stands for all the others. */
  strong?: boolean;
}) {
  const box = useRef<HTMLInputElement>(null);
  // "Some but not all" has no attribute of its own; it is a property set on the element.
  useEffect(() => {
    if (box.current) box.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    // A label wraps rather than push past its column on a narrow phone.
    <label
      className="label cursor-pointer justify-start gap-1.5 p-0 min-w-0 whitespace-normal"
      title={title}
    >
      <input
        ref={box}
        type="checkbox"
        name={name}
        className="checkbox checkbox-xs"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={`label-text text-xs ${strong ? 'font-medium' : ''}`}>
        {label}
        {/* The space outside the count's own element, or the box's name loses it. */}
        {count !== undefined && (
          <>
            {' '}
            <span className="opacity-60">({count})</span>
          </>
        )}
      </span>
    </label>
  );
}

/**
 * One switch per special feature a layout is typed with. Unticking one types every layout here
 * without it, as `off=` in the link: the Library ranks that way, Compare compares that way, and
 * Analyze, opened from either, analyzes the same way. Switches of the same kind, such as space and
 * shift, follow them in the same grid.
 */
export function FeatureSwitches({
  legend,
  help,
  without,
  onChange,
  children,
}: {
  legend: string;
  help?: ReactNode;
  without: readonly FeatureKind[];
  onChange: (without: FeatureKind[]) => void;
  children?: ReactNode;
}) {
  return (
    <SwitchGroup legend={legend} help={help}>
      {FEATURE_KINDS.map((kind) => (
        <Switch
          key={kind}
          label={FEATURE_LABELS[kind]}
          checked={!without.includes(kind)}
          onChange={(checked) =>
            onChange(
              checked
                ? without.filter((k) => k !== kind)
                : FEATURE_KINDS.filter((k) => k === kind || without.includes(k)),
            )
          }
        />
      ))}
      {children}
    </SwitchGroup>
  );
}
