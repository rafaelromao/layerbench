import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

/** The custom layout that already goes by a name, by its id and its name. */
export interface TakenLayout {
  id: string;
  name: string;
}

/**
 * A dialog that asks for a layout's name, with whatever else its caller needs to ask beside it
 * (`children`): New layout's board, Save a copy's none. It is a native `<dialog>`, as the settings
 * dialogs are, so Escape and a tap on the dimmed page around it are a change of mind and call
 * `onClose`. Mount it while it is open: it opens as it mounts, with the name selected to be typed
 * over, and an empty name is refused. So is a name `taken` says another custom layout has, as
 * saving under it would make a second: it offers instead to overwrite that one, or to type another
 * name.
 */
export function NameDialog({
  title,
  intro,
  nameLabel,
  initialName,
  submitLabel,
  taken = () => null,
  onSubmit,
  onOverwrite,
  onClose,
  children,
}: {
  title: string;
  /** What the name is for, above the field. */
  intro?: string;
  /** The field's accessible name. */
  nameLabel: string;
  initialName: string;
  submitLabel: string;
  /** The custom layout that already goes by a name, if any. */
  taken?: (name: string) => TakenLayout | null;
  /** The name, trimmed, not empty and no other custom layout's. The caller closes the dialog. */
  onSubmit: (name: string) => void;
  /** Save under the name, trimmed, in place of the custom layout that has it, as onSubmit does. */
  onOverwrite?: (name: string, taken: TakenLayout) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const clashId = useId();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.select();
  }, []);

  const trimmed = name.trim();
  const clash = trimmed ? taken(trimmed) : null;
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      // The page under a modal dialog is out of reach: its shortcuts, Undo among them, must not
      // hear a key pressed in here.
      onKeyDown={(e) => e.stopPropagation()}
    >
      <form
        className="modal-box max-w-md space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !clash) onSubmit(trimmed);
        }}
      >
        <h2 id={titleId} className="font-semibold text-base">
          {title}
        </h2>
        {intro && <p className="text-xs opacity-70">{intro}</p>}

        <label className="form-control">
          <span className="label-text text-xs">Name</span>
          <input
            ref={input}
            aria-label={nameLabel}
            // Opened on a name already taken, the field says why it is asked, which a status
            // filled before it opens may not be read out.
            aria-describedby={clashId}
            aria-invalid={clash !== null}
            className="input input-sm input-bordered"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {/* Read out as it changes: whoever types hears the name is taken, and when it is not. */}
        <p id={clashId} role="status" className="text-xs text-warning empty:hidden">
          {clash &&
            `A custom layout is already called ${clash.name}. ${
              onOverwrite
                ? 'Overwrite it, or type another name.'
                : 'It could not be overwritten, as GitHub and this browser each have a layout of the name: type another name.'
            }`}
        </p>
        {children}

        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          {clash && onOverwrite && (
            <button
              type="button"
              className="btn btn-warning btn-sm"
              onClick={() => onOverwrite(trimmed, clash)}
            >
              Overwrite {clash.name}
            </button>
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={!trimmed || !!clash}>
            {submitLabel}
          </button>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
}
