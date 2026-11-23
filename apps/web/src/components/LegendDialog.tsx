import type { CompiledLayout } from '@layerbench/core';
import { useEffect, useId, useRef, useState } from 'react';
import { KeyLegend } from './Keyboard.js';

/** One board's Legend: the layout it is of, and the layer its keys are numbered on. */
export interface LegendEntry {
  /** Which layout, where there is more than one on the page (`A: Qwerty`); absent for one. */
  title?: string;
  compiled: CompiledLayout;
  layer: number;
}

/**
 * The list of numbered keys, for the layer a board is showing, in a dialog: the numbers on the
 * keys say little by themselves, and a list that is always on the page, even folded, takes room the
 * board needs. It opens as it is drawn; its button, Escape or a click beside it closes it.
 */
function LegendDialog({ legends, onClose }: { legends: LegendEntry[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    // Opening on Close, not on a list that takes no input here.
    close.current?.focus();
  }, []);

  const several = legends.length > 1;
  return (
    <dialog ref={dialog} className="modal" aria-labelledby={titleId} onClose={onClose}>
      <div className={`modal-box ${several ? 'max-w-4xl' : 'max-w-xl'} flex flex-col gap-3`}>
        <h2 id={titleId} className="font-semibold text-base">
          Legend
        </h2>
        <p className="text-xs opacity-70">
          What the numbered keys on the board{several ? 's' : ''} stand for, on the layer
          {several ? 's' : ''} shown.
        </p>
        <div
          className={`min-w-0 max-h-[60vh] overflow-y-auto ${several ? 'grid gap-4 md:grid-cols-2' : ''}`}
        >
          {legends.map((l, i) => (
            <section
              // biome-ignore lint/suspicious/noArrayIndexKey: one or two, in a fixed order
              key={i}
              className="min-w-0 space-y-2"
              aria-label={l.title ? `Legend of ${l.title}` : undefined}
            >
              {l.title && (
                <h3 className="font-semibold text-sm">
                  {l.title}
                  {' · '}
                  <span className="font-normal opacity-70">
                    {l.compiled.layers[Math.min(l.layer, l.compiled.layers.length - 1)]?.name}
                  </span>
                </h3>
              )}
              <KeyLegend compiled={l.compiled} layer={l.layer} />
            </section>
          ))}
        </div>
        <div className="modal-action">
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

/**
 * The Legend's button, for the right of a section's heading, where its row has room, and the dialog
 * it opens. Off until there is a board to list the keys of.
 */
export function LegendButton({
  legends,
  className = '',
}: {
  legends: LegendEntry[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`btn btn-xs btn-outline shrink-0 ${className}`}
        aria-haspopup="dialog"
        title="List the numbered keys of the board"
        disabled={legends.length === 0}
        onClick={() => setOpen(true)}
      >
        Legend
      </button>
      {open && <LegendDialog legends={legends} onClose={() => setOpen(false)} />}
    </>
  );
}
