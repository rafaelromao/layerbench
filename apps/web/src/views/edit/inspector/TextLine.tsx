import { type Binding, type CompiledLayout, legend, legendText } from '@layerbench/core';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDismiss } from '../../../components/use-dismiss.js';
import { bindingFromFields } from '../binding-form.js';
import {
  type BindingTextContext,
  bindingText,
  parseBindingText,
  suggest,
} from '../binding-text.js';
import type { FocusRequest } from '../reducer.js';

/** Suggestions that take an argument keep the menu going: `&lt`, then the layer, then the tap. */
const takesArgument = (insert: string) =>
  /^&(kp|lt|mo|sl|to|tog|auto_layer|sk|macro|dead|uni|ref)$/.test(insert);

/**
 * The binding as ZMK text, for anyone who would rather type it: `&lt nav a`, `&sl sym`, `ç`.
 * Typing a character on a key lands here with that character already in, and Enter hands focus
 * back to the key, so a keyboard user can go round a layout without reaching for the mouse.
 */
export function BindingTextLine({
  compiled,
  keyId,
  binding,
  ctx,
  focusRequest,
  onCommit,
  onClear,
  onDone,
}: {
  compiled: CompiledLayout;
  keyId: string;
  binding: Binding | undefined;
  ctx: BindingTextContext;
  focusRequest: FocusRequest | null;
  onCommit: (b: Binding) => void;
  onClear: () => void;
  /** Give focus back to the key, after Enter or Escape. */
  onDone: () => void;
}) {
  const written = useMemo(() => bindingText(compiled, binding), [compiled, binding]);
  // A binding the syntax cannot write whole is not offered as text: committing it back would
  // quietly drop what the syntax has no room for. The field starts empty and replaces it.
  const initial = written.exact ? written.text : '';
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  /** Set by a tap outside the field and its list; typing or coming back to the field clears it. */
  const [dismissed, setDismissed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  /** Set while focus is deliberately moved off the field, so the blur is not also a commit. */
  const leaving = useRef(false);
  const shown = useRef(initial);

  // The binding changed under the field — a control above, an undo — so the field shows it.
  useEffect(() => {
    if (shown.current === initial) return;
    shown.current = initial;
    setText(initial);
    setError(null);
  }, [initial]);

  useLayoutEffect(() => {
    if (!focusRequest || focusRequest.keyId !== keyId) return;
    const el = input.current;
    if (!el) return;
    el.focus();
    // Enter offers the whole binding for replacement; a typed character starts a new one.
    if (focusRequest.seed === null) el.select();
    else setText(focusRequest.seed);
  }, [focusRequest, keyId]);

  const parsed = useMemo(
    () => (text.trim() === '' || text.trim() === initial ? null : parseBindingText(text, ctx)),
    [text, initial, ctx],
  );
  const preview = parsed?.ok ? legend(compiled, bindingFromFields(parsed.fields)) : null;
  const options = useMemo(() => {
    if (!focused || dismissed || !text.trimStart().startsWith('&')) return [];
    const written = text.trim();
    // Offering exactly what is written, with no argument still to come, is a menu that could
    // never close: choosing it changes nothing.
    return suggest(text, ctx)
      .filter((o) => o.insert !== written || takesArgument(o.insert))
      .slice(0, 8);
  }, [focused, dismissed, text, ctx]);
  useDismiss(box, () => setDismissed(true), { active: options.length > 0, closeOnEscape: false });

  const leave = () => {
    leaving.current = true;
    onDone();
    leaving.current = false;
  };

  /** True when the field holds something that could not be applied, and stays for fixing. */
  const commit = (then: 'stay' | 'leave'): void => {
    const trimmed = text.trim();
    // An empty field is a change of mind, never an instruction to wipe the key, and text that did
    // not change is not an edit — committing it would mark the layout unsaved for nothing.
    if (trimmed === '' || trimmed === initial) {
      setError(null);
      if (then === 'leave') leave();
      return;
    }
    const result = parseBindingText(trimmed, ctx);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onCommit(bindingFromFields(result.fields));
    if (then === 'leave') leave();
  };

  const take = (insert: string) => {
    setText(takesArgument(insert) ? `${insert} ` : insert);
    setActive(-1);
    setError(null);
    input.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // The field's own Escape: the inspector around it should not also close.
      e.stopPropagation();
      setText(initial);
      setError(null);
      leave();
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
      if (active >= 0 && options[active]) take(options[active].insert);
      else commit('leave');
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && text === '') {
      e.preventDefault();
      onClear();
      leave();
    }
  };

  return (
    <div className="space-y-1" ref={box}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`lb-text-${keyId}`} className="text-xs font-semibold w-16 shrink-0">
          Or type
        </label>
        <input
          id={`lb-text-${keyId}`}
          ref={input}
          aria-label={`Binding for ${keyId}`}
          aria-invalid={error !== null}
          className={`input input-sm input-bordered font-mono flex-1 min-w-40 ${error ? 'input-error' : ''}`}
          value={text}
          placeholder={
            written.exact ? 'a, &mo nav, &lt nav a' : `replace ${written.text} — a, &mo nav…`
          }
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="done"
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setActive(-1);
            setDismissed(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setFocused(false);
            if (!leaving.current) commit('stay');
          }}
        />
        {preview && (
          <span className="text-xs font-mono opacity-90" title={preview.detail}>
            → {legendText({ ...preview, tap: preview.tap || '·' })}
          </span>
        )}
      </div>
      {options.length > 0 && (
        <ul className="menu menu-xs p-0 max-h-40 overflow-y-auto" aria-label="Suggestions">
          {options.map((option, i) => (
            <li key={option.insert}>
              <button
                type="button"
                className={`font-mono justify-between ${i === active ? 'menu-active' : ''}`}
                // Keeps focus in the field, so taking a suggestion is not also a blur and a commit.
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
      {error && <p className="text-error text-xs">{error}</p>}
      {!written.exact && binding && (
        <p className="text-[11px] opacity-60">
          This key is {written.why}; the controls above edit all of it. A binding typed here
          replaces it.
        </p>
      )}
    </div>
  );
}
