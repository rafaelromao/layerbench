/**
 * The tag of a custom layout that holds a change proposed to the Library, a link to its pull
 * request. One tag wherever the layout is shown: a card of the Library, and the bar of Analyze.
 */
export function ProposedBadge({ href, size = 'xs' }: { href: string; size?: 'xs' | 'sm' }) {
  return (
    <a
      className={`badge badge-outline badge-accent shrink-0 ${size === 'sm' ? 'badge-sm' : 'badge-xs'}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="A change proposed to the Library: its pull request"
    >
      proposed
    </a>
  );
}
