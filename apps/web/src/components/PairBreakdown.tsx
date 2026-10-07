import type { CompiledLayout, RuleItem, RuleItemNext } from '@layerbench/core';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { normalizeHeat } from '../engine/heat.js';
import { formatItem } from './format.js';
import { Keyboard } from './Keyboard.js';

/**
 * What a layer key was pressed for: the keys pressed next, drawn on the board of the layer it
 * reached, each warm by its share, and listed with its part. It opens as it is drawn; its button,
 * Escape or a click beside it closes it.
 */
export function PressedFor({
  compiled,
  title,
  description,
  next,
  onClose,
}: {
  compiled: CompiledLayout;
  title: ReactNode;
  /** What the list shows, given the name of the layer reached. */
  description: (reached: string) => ReactNode;
  next: RuleItemNext[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    // Opening on Close, not on the board, which takes no input here.
    close.current?.focus();
  }, []);

  const reached = reachedLayer(next);
  const layerName = (l: number) => compiled.layers[l]?.name ?? String(l);
  const heat = normalizeHeat(
    Object.fromEntries(next.filter((t) => t.layer === reached).map((t) => [t.key, t.share])),
  );
  const top = Math.max(0, ...next.map((t) => t.share));

  return (
    <dialog ref={dialog} className="modal" aria-labelledby={titleId} onClose={onClose}>
      <div className="modal-box max-w-2xl flex flex-col gap-3">
        <header>
          <h2 id={titleId} className="font-semibold text-lg">
            {title}
          </h2>
          <p className="text-sm opacity-70">{description(layerName(reached))}</p>
        </header>

        <Keyboard
          compiled={compiled}
          layer={reached}
          heat={heat}
          interactive={false}
          className="w-full"
        />

        <ol className="lb-items lb-items-large space-y-1" aria-label="Keys pressed next">
          {next.map((t) => (
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

/** The layer a key reached: the one most of what followed it was pressed on. */
export function reachedLayer(next: readonly RuleItemNext[]): number {
  const byLayer = new Map<number, number>();
  for (const t of next) byLayer.set(t.layer, (byLayer.get(t.layer) ?? 0) + t.count);
  return [...byLayer.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** What the layer key at the end of a pair was pressed for, the pair's own part split among them. */
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
  return (
    <PressedFor
      compiled={compiled}
      next={item.then ?? []}
      onClose={onClose}
      title={
        <>
          <span className="font-mono">{item.label}</span>
          <span className="font-normal opacity-60"> · {rule}</span>
        </>
      }
      description={(reached) => (
        <>
          What its last key was pressed for: the key typed next on {reached}, and each one's part of
          the pair's {formatItem(item)}.
        </>
      )}
    />
  );
}
