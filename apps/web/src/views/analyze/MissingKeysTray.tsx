import { useCharDrag } from '../../components/use-key-drag.js';
import type { TrayChar } from '../edit/tray.js';

/** How a character reads on a chip: a space is drawn, not left blank. */
export function charLabel(c: string): string {
  return c === ' ' ? '␣' : c;
}

/** How a character is read out: a space by its name. */
function spoken(c: string): string {
  return c === ' ' ? 'space' : c;
}

/**
 * The characters the layout cannot type, to put on keys: dragged onto one, or tapped and then a key
 * tapped, for a finger. The text's own characters say how often it has them.
 */
export function MissingKeysTray({
  chars,
  placing,
  why,
  share,
  onArm,
  onDrop,
  board,
}: {
  chars: TrayChar[];
  /** The character tapped, waiting for its key. */
  placing: string | null;
  /** Why a character with no count is in the tray. */
  why: (c: string) => string;
  /** What share of the text a character's count is. */
  share: (count: number) => string;
  onArm: (char: string) => void;
  onDrop: (drop: { char: string; to: string }) => void;
  /** The board a character is dropped on. */
  board: () => Element | null;
}) {
  const drag = useCharDrag(board, onDrop, charLabel);
  if (chars.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <p>
        <span className="font-semibold">Missing keys</span>{' '}
        <span className="opacity-70">— drag one onto a key, or tap it and then the key.</span>
      </p>
      <ul className="flex flex-wrap gap-1" aria-label="Missing keys">
        {chars.map(({ char, count }) => (
          <li key={char}>
            <button
              type="button"
              className={`lb-tray-chip btn btn-xs font-mono gap-1 ${
                placing === char ? 'btn-primary' : 'btn-outline btn-error'
              }`}
              aria-pressed={placing === char}
              aria-label={
                count === undefined
                  ? spoken(char)
                  : `${spoken(char)}, ${count.toLocaleString('en-US')} times in the text`
              }
              title={
                count === undefined
                  ? why(char)
                  : `In the text ${count.toLocaleString('en-US')} times · ${share(count)}`
              }
              {...drag.handlers(char)}
              onClick={() => {
                if (drag.consumeClick()) return;
                onArm(char);
              }}
            >
              {charLabel(char)}
              {count !== undefined && (
                <span className="opacity-70"> ×{count.toLocaleString('en-US')}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
