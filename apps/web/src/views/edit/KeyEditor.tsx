import { legend } from '@layoutmaster/core';
import {
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCoarsePointer } from '../../components/use-coarse-pointer.js';
import { type Anchor, anchorKey } from './anchor.js';
import { bindingFromFields } from './binding-form.js';
import { type BindingTextContext, bindingText, parseBindingText, suggest } from './binding-text.js';
import type { EditAction, EditState } from './reducer.js';

export interface KeyEditorProps {
  state: EditState;
  send: Dispatch<EditAction>;
  /** The positioned box the keyboard is drawn in; the editor is placed inside it. */
  wrapper: HTMLElement | null;
  /** Hand focus back to the key, which has to happen before the editor goes away. */
  focusKey: (keyId: string) => void;
  /** Say what happened, for a screen reader: a changed key legend is not announced on its own. */
  announce: (message: string) => void;
}

/** The editor that opens on a key. Remounts per key, so its state never outlives the key it edits. */
export function KeyEditor(props: KeyEditorProps) {
  const editing = props.state.editing;
  if (!editing) return null;
  return <Editor {...props} key={editing.keyId} keyId={editing.keyId} seed={editing.seed} />;
}

const SAME: Anchor = { left: 0, top: 0, above: false };

function Editor({
  state,
  send,
  wrapper,
  focusKey,
  announce,
  keyId,
  seed,
}: KeyEditorProps & { keyId: string; seed: string | null }) {
  const { compiled, layer } = state;
  const activeLayer = compiled.layers[layer];
  const pos = compiled.keyIndex.get(keyId);
  const current = pos === undefined ? undefined : activeLayer.bindings[pos];
  const written = useMemo(() => bindingText(compiled, current), [compiled, current]);

  // A binding a feature generated is rewritten on the next compile, so editing it here would look
  // as though nothing happened.
  const owner = compiled.featureOwned.get(activeLayer.id)?.get(keyId);
  const [replacing, setReplacing] = useState(false);
  const editable = owner === undefined && (written.exact || replacing);

  const [text, setText] = useState(() => (written.exact ? (seed ?? written.text) : ''));
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  /** Whether the reader has changed the text yet, which decides if the menu still offers the root. */
  const [touched, setTouched] = useState(false);

  const coarse = useCoarsePointer();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFieldSetElement>(null);
  /** Set while focus is deliberately being moved off the input, so blur does not also commit. */
  const leaving = useRef(false);

  const ctx: BindingTextContext = useMemo(
    () => ({
      layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })),
      behaviors: Object.keys(state.layout.behaviors ?? {}),
      hostLocale: compiled.hostLocale,
    }),
    [compiled, state.layout.behaviors],
  );

  const parsed = useMemo(
    () => (text.trim() === '' ? null : parseBindingText(text, ctx)),
    [text, ctx],
  );
  const preview = parsed?.ok ? legend(compiled, bindingFromFields(parsed.fields)) : null;
  const options = useMemo(() => {
    if (!editable) return [];
    const direct = suggest(text, ctx);
    if (direct.length > 0) return direct.slice(0, 8);
    // A finger has no keyboard up to type the `&` that summons the menu, and the editor opens on
    // the binding already there — so until the reader changes something, offer the whole list.
    if (coarse && !touched) return suggest('', ctx).slice(0, 8);
    return [];
  }, [editable, text, ctx, coarse, touched]);
  /** Taking a suggestion that needs an argument should leave the next list open, not close it. */
  const takesArgument = (insert: string) =>
    /^&(kp|lt|mo|sl|to|tog|auto_layer|sk|macro|dead|uni|ref)$/.test(insert);

  const [anchor, setAnchor] = useState<Anchor>(SAME);
  useLayoutEffect(() => {
    const place = () => {
      const keyEl = wrapper?.querySelector(`g[data-key="${keyId}"]`);
      if (!wrapper || !keyEl) return;
      const next = anchorKey(wrapper, keyEl, box.current);
      setAnchor((prev) =>
        prev.left === next.left && prev.top === next.top && prev.above === next.above ? prev : next,
      );
    };
    place();
    // The on-screen keyboard opening is a viewport change and nothing else: it resizes no element,
    // so only the visual viewport reports it.
    window.visualViewport?.addEventListener('resize', place);
    // On a narrow screen the board pans, which moves the key out from under the editor.
    const scroller = wrapper?.querySelector('.lm-board-scroll');
    scroller?.addEventListener('scroll', place, { passive: true });
    const observer =
      wrapper && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (wrapper) observer?.observe(wrapper);
    return () => {
      window.visualViewport?.removeEventListener('resize', place);
      scroller?.removeEventListener('scroll', place);
      observer?.disconnect();
    };
  }, [wrapper, keyId]);

  useLayoutEffect(() => {
    if (!editable) return;
    // On a finger, focusing the field raises the on-screen keyboard over half the screen before
    // the reader has said they want to type. The suggestions are enough to build most bindings by
    // tapping, so the field waits to be asked.
    if (coarse && seed === null) {
      box.current?.scrollIntoView({ block: 'nearest' });
      return;
    }
    input.current?.focus();
    // Opening with Enter offers the whole binding for replacement; a typed character continues it.
    if (seed === null) input.current?.select();
  }, [editable, seed, coarse]);

  const leave = (run: () => void) => {
    leaving.current = true;
    focusKey(keyId);
    run();
    leaving.current = false;
  };

  const close = (): void => {
    leave(() => send({ type: 'closeEditor' }));
  };

  const commit = (onBlur: boolean): void => {
    const trimmed = text.trim();
    // An empty field is a change of mind, never an instruction to wipe the key. Text that did not
    // change is not an edit either, so committing it does not mark the layout unsaved.
    if (trimmed === '' || (written.exact && trimmed === written.text)) {
      close();
      return;
    }
    const result = parseBindingText(trimmed, ctx);
    if (!result.ok) {
      // On blur there is nowhere to show the error, so the half-typed text is simply dropped.
      if (onBlur) {
        close();
        return;
      }
      setError(result.error);
      input.current?.focus();
      return;
    }
    leave(() => {
      send({ type: 'commitBinding', keyId, binding: bindingFromFields(result.fields) });
      announce(
        `${keyId} set to ${legend(compiled, bindingFromFields(result.fields)).tap || 'empty'}`,
      );
    });
  };

  const take = (option: string) => {
    // A behaviour that still needs an argument gets the space that opens the next list, so a
    // binding can be built entirely by tapping: `&lt` then `num` then `a`.
    setText(takesArgument(option) ? `${option} ` : option);
    setActive(-1);
    setError(null);
    setTouched(true);
    // A finger taking a suggestion has not asked for the on-screen keyboard.
    if (!coarse) input.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (options.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      // Slot 0 is "nothing chosen", so the list cycles back through the typed text.
      const slots = options.length + 1;
      setActive((i) => ((i + 1 + step + slots) % slots) - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && options[active]) {
        take(options[active].insert);
        return;
      }
      commit(false);
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && text === '') {
      e.preventDefault();
      leave(() => {
        send({ type: 'clearKey', keyId });
        announce(`${keyId} cleared`);
      });
    }
  };

  const otherLayers = compiled.layers.filter((l) => l.idx !== layer);

  return (
    <fieldset
      ref={box}
      className="lm-key-editor card bg-base-100 border border-primary shadow-lg p-2 space-y-1"
      style={{ left: anchor.left, top: anchor.top, transform: 'translateX(-50%)' }}
      aria-label={`Edit ${keyId}`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="badge badge-neutral badge-sm font-mono">{keyId}</span>
        <span className="opacity-60">{activeLayer.name}</span>
        {preview && (
          <span className="font-mono opacity-90">
            → {preview.tap || '·'}
            {preview.hold ? ` / ${preview.hold}` : ''}
          </span>
        )}
      </div>

      {owner !== undefined ? (
        <p className="text-xs opacity-70 max-w-64">
          Generated by the <span className="font-mono">{owner}</span> feature. Turn that feature off
          in Features to edit this key directly.
        </p>
      ) : !editable ? (
        <div className="space-y-1 max-w-64">
          <p className="text-xs opacity-70">
            <span className="font-mono">{written.text}</span> is {written.why}, so it has no text
            form to edit.
          </p>
          <div className="flex gap-1">
            <button type="button" className="btn btn-xs" onClick={() => setReplacing(true)}>
              Replace
            </button>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => leave(() => send({ type: 'setPanel', panel: 'binding' }))}
            >
              Key panel
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            ref={input}
            aria-label={`Binding for ${keyId}`}
            className={`input input-sm input-bordered font-mono w-56 ${error ? 'input-error' : ''}`}
            value={text}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
              setActive(-1);
              setTouched(true);
            }}
            onKeyDown={onKeyDown}
            onBlur={(e) => {
              if (leaving.current) return;
              if (box.current?.contains(e.relatedTarget as Node)) return;
              commit(true);
            }}
          />

          {options.length > 0 && (
            <ul className="menu menu-xs p-0 max-h-40 overflow-y-auto" aria-label="Suggestions">
              {options.map((option, i) => (
                <li key={option.insert}>
                  <button
                    type="button"
                    className={`font-mono justify-between ${i === active ? 'menu-active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => take(option.insert)}
                  >
                    <span>{option.label}</span>
                    {option.hint && <span className="opacity-50 text-[10px]">{option.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-error text-xs max-w-56">{error}</p>}

          {/* A finger has no Enter and no Escape: the two that matter are on screen. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-sm btn-primary flex-1"
              disabled={parsed !== null && !parsed.ok}
              onClick={() => commit(false)}
            >
              Apply
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={close}>
              Cancel
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => leave(() => send({ type: 'clearKey', keyId }))}
            >
              clear
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() =>
                leave(() => {
                  send({ type: 'closeEditor' });
                  send({ type: 'startSwap', mode: 'swap' });
                })
              }
            >
              swap with…
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() =>
                leave(() => {
                  send({ type: 'closeEditor' });
                  send({ type: 'startSwap', mode: 'copy' });
                })
              }
            >
              copy to…
            </button>
            {otherLayers.length > 0 && (
              <select
                aria-label={`Send ${keyId} to another layer`}
                className="select select-xs select-bordered"
                value=""
                onChange={(e) => {
                  const layerId = e.target.value;
                  if (layerId)
                    leave(() =>
                      send({
                        type: 'dropKey',
                        from: keyId,
                        to: { kind: 'layer', layerId },
                        // The plain gesture; onto a layer it moves rather than copies.
                        mode: 'swap',
                      }),
                    );
                }}
              >
                <option value="">send to…</option>
                {otherLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
