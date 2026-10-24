import type { CompiledLayout } from '@layerbench/core';
import { useEffect, useId, useRef, useState } from 'react';
import { fmt } from './combo-layout.js';
import { type KeyboardCombo, keyCaps } from './Keyboard.js';

export interface CombosApartProps {
  /** The layout the combos come from, as the board beside the button draws it. */
  compiled: CompiledLayout;
  /** The layer the board shows. */
  layer: number;
  /** The combos that work on that layer and are not drawn on the board (`combosApart`). */
  combos: readonly KeyboardCombo[];
  /** A combo picked, by its place, to open it in the editor; without it they are only drawn. */
  onComboClick?: (index: number) => void;
  /** The dialog opened, for a view to stop what would change the board under it. */
  onOpen?: () => void;
}

/**
 * The combos the board does not draw, on three or more keys, on keys apart, or with no room on
 * their gap: a small button beside the board on a layer that has any, which opens them. Each is
 * drawn once, on a small board of its own with its keys filled, as Keymap Drawer draws a combo
 * apart (`draw_separate`), with the layers it works on. The button lights while one of them is
 * the press being played, as a box on the board does.
 */
export function CombosApart({ compiled, layer, combos, onComboClick, onOpen }: CombosApartProps) {
  // What the dialog shows is what the board showed when it opened, whatever the board does since.
  const [opened, setOpened] = useState<{ layer: number; combos: readonly KeyboardCombo[] } | null>(
    null,
  );
  const name = compiled.layers[layer]?.name ?? '';
  const playing = combos.find((c) => c.active);
  const count = `${combos.length} more ${combos.length === 1 ? 'combo' : 'combos'}`;
  return (
    <>
      {combos.length > 0 && (
        <button
          type="button"
          className={`btn btn-xs ${playing ? 'btn-primary' : 'btn-outline'}`}
          aria-haspopup="dialog"
          aria-label={`${count} on ${name}${playing ? `, one being played: ${playing.label}` : ''}`}
          onClick={() => {
            onOpen?.();
            setOpened({ layer, combos });
          }}
        >
          {count}
        </button>
      )}
      {opened && (
        <CombosApartDialog
          compiled={compiled}
          layer={opened.layer}
          combos={opened.combos}
          onComboClick={onComboClick}
          onClose={() => setOpened(null)}
        />
      )}
    </>
  );
}

function CombosApartDialog({
  compiled,
  layer,
  combos,
  onComboClick,
  onClose,
}: Omit<CombosApartProps, 'onOpen'> & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const captions = useId();
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    close.current?.focus();
  }, []);
  const name = compiled.layers[layer]?.name ?? '';

  return (
    <dialog ref={dialog} className="modal" aria-labelledby={titleId} onClose={onClose}>
      <div className="modal-box max-w-3xl flex flex-col gap-3">
        <header>
          <h2 id={titleId} className="font-semibold text-lg">
            Combos on {name}
          </h2>
          <p className="text-sm opacity-70">
            These combos press three or more keys, or keys apart, or have no room on the gap between
            their keys, so the board does not draw them. Each one is drawn here once, with its keys
            filled, and the layers it works on under it.
          </p>
        </header>
        <ul className="lb-combos-apart" aria-label={`Combos on ${name}`}>
          {combos.map((c) => {
            const names = c.keys.map((p) => compiled.keys[p]?.id ?? '?').join(' + ');
            // Its colour marks a dead key to the eye; the words say it to everyone.
            const what = `${c.label}${c.dead ? ', dead key' : ''}`;
            const caption = `${captions}-${c.index}`;
            const body = (
              <>
                <span className={`lb-combo-apart-legend${c.dead ? ' lb-combo-dead' : ''}`}>
                  <span className="lb-combo-apart-tap">{c.tap ?? c.label}</span>
                  {c.hold && <span className="lb-combo-apart-hold">{c.hold}</span>}
                </span>
                <ComboKeys compiled={compiled} keys={c.keys} names={names} />
                <span id={caption} className="lb-combo-apart-layers">
                  {worksOn(compiled, c.index)}
                </span>
              </>
            );
            return (
              <li key={c.index}>
                {onComboClick ? (
                  <button
                    type="button"
                    className="lb-combo-apart"
                    aria-label={`Edit combo ${names}: ${what}`}
                    aria-describedby={caption}
                    onClick={() => {
                      onComboClick(c.index);
                      dialog.current?.close();
                    }}
                  >
                    {body}
                  </button>
                ) : (
                  <figure className="lb-combo-apart" aria-label={`Combo ${names}: ${what}`}>
                    {body}
                  </figure>
                )}
              </li>
            );
          })}
        </ul>
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

/** The board's keys, small, with a combo's own filled. */
function ComboKeys({
  compiled,
  keys,
  names,
}: {
  compiled: CompiledLayout;
  keys: readonly number[];
  names: string;
}) {
  const { caps, width, height } = keyCaps(compiled);
  const on = new Set(keys);
  return (
    <svg
      className="lb-combo-apart-board"
      viewBox={`0 0 ${fmt(width)} ${fmt(height)}`}
      role="img"
      aria-label={`Keys ${names}`}
    >
      {caps.map((k, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: a key's position is what it is drawn by
          key={i}
          x={fmt(k.cx - k.w / 2)}
          y={fmt(k.cy - k.h / 2)}
          width={fmt(k.w)}
          height={fmt(k.h)}
          rx="9"
          transform={`rotate(${fmt(k.rotation)} ${fmt(k.cx)} ${fmt(k.cy)})`}
          className={on.has(i) ? 'lb-combo-apart-key lb-combo-apart-key-on' : 'lb-combo-apart-key'}
        />
      ))}
    </svg>
  );
}

/** The layers a combo works on, in words: every one, or each by name. */
export function worksOn(compiled: CompiledLayout, index: number): string {
  const mask = compiled.combos.find((c) => c.idx === index)?.layerMask ?? null;
  const layers = compiled.layers.filter((_, i) => mask === null || (mask & (1 << i)) !== 0);
  if (layers.length === compiled.layers.length) return 'Every layer';
  const names = layers.map((l) => l.name);
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    : (names[0] ?? '');
}
