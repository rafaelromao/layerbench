/**
 * The button that opens the image of what a page shows (`ShareImageDialog`), in the row of the
 * Heat choice, where the colours it carries are chosen. Not "Export": that is the editor's panel for
 * the layout as text. Disabled, with the reason as its title, until the numbers it draws are made.
 */
export function ExportImageButton({
  blocked,
  onClick,
  what = 'the first layer',
  className = '',
}: {
  /** Why there is no image yet; null once the numbers it shows are made. */
  blocked: string | null;
  onClick: () => void;
  /** What the image holds, for the button's title. */
  what?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn btn-xs btn-outline shrink-0 ${className}`}
      aria-label="Export image"
      title={blocked ?? `Make an image of ${what}, with its heat and credits, to post or share`}
      disabled={blocked !== null}
      onClick={onClick}
    >
      Export image
    </button>
  );
}
