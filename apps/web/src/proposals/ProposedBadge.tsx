/**
 * The tag of a custom layout that holds a change proposed to the Library, a link to its pull
 * request. One tag wherever the layout is shown: a card of the Library, and the bar of Analyze.
 * `merged` is for a change whose pull request is merged but whose layout has not reached this app:
 * the Library comes with the app, so it joins it with the next deploy, and the copy stays until then.
 */
export function ProposedBadge({
  href,
  size = 'xs',
  merged = false,
}: {
  href: string;
  size?: 'xs' | 'sm';
  merged?: boolean;
}) {
  return (
    <a
      className={`badge badge-outline badge-accent shrink-0 ${size === 'sm' ? 'badge-sm' : 'badge-xs'}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={
        merged
          ? 'Merged: it joins the Library when the app is updated, a few minutes after the merge; reload then. Its pull request'
          : 'A change proposed to the Library: its pull request'
      }
    >
      {merged ? 'merged' : 'proposed'}
    </a>
  );
}
