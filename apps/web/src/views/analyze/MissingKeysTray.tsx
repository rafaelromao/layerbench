import { useCharDrag } from '../../components/use-key-drag.js';
import { charLabel, spoken, type TrayChar } from '../edit/tray.js';

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
  onDisarm,
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
  /** Put the character tapped down again. */
  onDisarm: () => void;
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
      <ul
        className="flex flex-wrap gap-1"
        aria-label="Missing keys"
        onKeyDown={(e) => {
          // The note under the board says Escape puts a character down: from the chips as from
          // the board.
          if (e.key !== 'Escape' || placing === null) return;
          e.preventDefault();
          onDisarm();
        }}
      >
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
                  : `${spoken(char)}, ${count.toLocaleString('en-US')} times in the text, ${share(count)}`
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
