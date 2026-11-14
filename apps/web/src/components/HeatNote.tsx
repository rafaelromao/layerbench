/**
 * Why a board is plain while heat is on: not scored yet, never scored, or nothing on this layer.
 * `both` is for two boards read on one scale, which waits for the two of them.
 */
export function HeatNote({
  pending,
  failed,
  bare,
  drawn,
  both = false,
}: {
  pending: boolean;
  failed: boolean;
  bare: boolean;
  drawn: string | undefined;
  both?: boolean;
}) {
  const text = pending
    ? both
      ? 'Heat appears once both layouts are scored.'
      : 'Heat appears once the layout is scored.'
    : failed
      ? 'No heat: the layout could not be scored.'
      : bare
        ? `Nothing on this layer is coloured by ${drawn}.`
        : null;
  return text && <p className="lb-heat-note text-xs opacity-60">{text}</p>;
}
