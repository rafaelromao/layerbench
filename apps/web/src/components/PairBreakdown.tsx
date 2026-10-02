import type { CompiledLayout, RuleItem } from '@layoutmaster/core';
import { useEffect, useRef } from 'react';
import { normalizeHeat } from '../engine/heat.js';
import { formatItem } from './format.js';
import { Keyboard } from './Keyboard.js';

/**
 * What the layer key at the end of a pair was pressed for: the keys pressed next, which the pair
 * would not exist without. Drawn on the board of the layer it reached, each key warm by its part of
 * the pair, and listed with that part. It opens as it is drawn; its button, Escape or a click
 * beside it closes it.
 */
export function PairBreakdown({
  compiled,
  rule,
  item,
  onClose,
}: {
  compiled: CompiledLayout;
  /** The rule the pair is listed under. */
  rule: string;
  item: RuleItem;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    // Opening on Close, not on the board, which takes no input here.
    close.current?.focus();
  }, []);

  const then = item.then ?? [];
  // The layer it reached is the one most of what followed was pressed on.
  const byLayer = new Map<number, number>();
  for (const t of then) byLayer.set(t.layer, (byLayer.get(t.layer) ?? 0) + t.count);
  const reached = [...byLayer.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const layerName = (l: number) => compiled.layers[l]?.name ?? String(l);
  const heat = normalizeHeat(
    Object.fromEntries(then.filter((t) => t.layer === reached).map((t) => [t.key, t.share])),
  );
  const top = Math.max(0, ...then.map((t) => t.share));

  return (
    <dialog ref={dialog} className="modal" aria-labelledby="pair-breakdown-title" onClose={onClose}>
      <div className="modal-box max-w-2xl flex flex-col gap-3">
        <header>
          <h2 id="pair-breakdown-title" className="font-semibold text-lg">
            <span className="font-mono">{item.label}</span>
            <span className="font-normal opacity-60"> · {rule}</span>
          </h2>
          <p className="text-sm opacity-70">
            What its last key was pressed for: the key typed next on {layerName(reached)}, and each
            one's part of the pair's {formatItem(item)}.
          </p>
        </header>

        <Keyboard
          compiled={compiled}
          layer={reached}
          heat={heat}
          interactive={false}
          className="w-full"
        />

        <ol className="lm-items lm-items-large space-y-1" aria-label="Keys pressed next">
          {then.map((t) => (
            <li key={`${t.layer}-${t.key}-${t.label}`} className="flex items-center gap-2 text-sm">
              <span className="font-mono w-48 break-words">
                {t.label}
                {t.layer !== reached && (
                  <span className="opacity-60 font-sans text-xs"> on {layerName(t.layer)}</span>
                )}
              </span>
              <div className="flex-1 h-2.5 rounded bg-base-200 overflow-hidden">
                <div
                  className="h-full bg-primary/60"
                  style={{ width: `${top > 0 ? (t.share / top) * 100 : 0}%` }}
                />
              </div>
              <span className="font-mono tabular-nums opacity-70 w-16 text-right">
                {formatItem({ label: t.label, keys: [t.key], percent: t.percent })}
              </span>
              <span className="font-mono tabular-nums opacity-50 w-12 text-right">
                {t.share < 0.005 ? '<1' : Math.round(t.share * 100)}%
              </span>
            </li>
          ))}
        </ol>

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
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
}
