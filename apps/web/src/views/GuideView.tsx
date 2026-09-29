import { Link, useLocation, useParams } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  anchorsOf,
  type InlineContext,
  MarkdownBlocks,
  parseGuide,
  renderInline,
  type Section,
} from '../guide/markdown.js';
import {
  GUIDE_PAGES,
  type GuidePage,
  guidePage,
  type LinkTarget,
  resolveLink,
} from '../guide/pages.js';

/**
 * A link to a page of the guide. Only the page itself counts as where the reader is: every page
 * sits under `/guide`, which the router would otherwise take the index to be active for.
 */
function PageLink({
  slug,
  hash,
  className,
  children,
}: {
  slug: string;
  hash?: string;
  className?: string;
  children: ReactNode;
}) {
  const common = { hash, className, activeOptions: { exact: true, includeHash: false } };
  return slug === '' ? (
    <Link to="/guide" {...common}>
      {children}
    </Link>
  ) : (
    <Link to="/guide/$page" params={{ page: slug }} {...common}>
      {children}
    </Link>
  );
}

function GuideLink({ target, children }: { target: LinkTarget; children: ReactNode }) {
  if (target.kind === 'external') {
    return (
      <a className="link" href={target.href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <PageLink slug={target.slug} hash={target.hash} className="link">
      {children}
    </PageLink>
  );
}

function SectionView({
  section,
  level,
  open,
  onToggle,
  ctx,
}: {
  section: Section;
  level: 2 | 3;
  open: ReadonlySet<string>;
  onToggle: (id: string, open: boolean) => void;
  ctx: InlineContext;
}) {
  const id = section.heading.id;
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <details
      id={id}
      className={`lm-guide-section lm-guide-level-${level}`}
      open={open.has(id)}
      onToggle={(e) => onToggle(id, e.currentTarget.open)}
    >
      <summary>
        <Heading>{renderInline(section.heading.text, ctx, id)}</Heading>
      </summary>
      <div className="lm-guide-body">
        <MarkdownBlocks blocks={section.blocks} ctx={ctx} />
        {section.subsections.map((sub) => (
          <SectionView
            key={sub.heading.id}
            section={sub}
            level={3}
            open={open}
            onToggle={onToggle}
            ctx={ctx}
          />
        ))}
      </div>
    </details>
  );
}

/**
 * One page of the guide, unfolded as far as the reader asks: its opening is always shown, every
 * section opens on request, and a link to a section opens it and the section around it.
 */
function GuidePageView({ page, hash }: { page: GuidePage; hash: string }) {
  const doc = useMemo(() => parseGuide(page.source), [page]);
  const anchors = useMemo(() => anchorsOf(doc), [doc]);
  const every = useMemo(
    () => doc.sections.flatMap((s) => [s.heading.id, ...s.subsections.map((x) => x.heading.id)]),
    [doc],
  );
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(anchors.get(hash) ?? []));

  // A link to an anchor opens whatever hides it, then brings it into view — once, so a section the
  // reader closes afterwards stays closed.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (hash === '' || shown.current === hash) return;
    const needed = anchors.get(hash);
    if (!needed) return;
    if (!needed.every((id) => open.has(id))) {
      setOpen((prev) => new Set([...prev, ...needed]));
      return;
    }
    shown.current = hash;
    document.getElementById(hash)?.scrollIntoView?.({ block: 'start' });
  }, [hash, anchors, open]);

  const toggle = useCallback((id: string, isOpen: boolean) => {
    setOpen((prev) => {
      if (prev.has(id) === isOpen) return prev;
      const next = new Set(prev);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const ctx = useMemo<InlineContext>(
    () => ({
      link: (href, children, key) => (
        <GuideLink key={key} target={resolveLink(href, page)}>
          {children}
        </GuideLink>
      ),
    }),
    [page],
  );

  return (
    <article className="lm-guide-page" aria-labelledby="lm-guide-title">
      <h1 id="lm-guide-title">{renderInline(doc.title, ctx, 'title')}</h1>
      <MarkdownBlocks blocks={doc.intro} ctx={ctx} />
      {every.length > 0 && (
        <div className="lm-guide-tools">
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            disabled={open.size === every.length}
            onClick={() => setOpen(new Set(every))}
          >
            Open every section
          </button>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            disabled={open.size === 0}
            onClick={() => setOpen(new Set())}
          >
            Close them all
          </button>
        </div>
      )}
      {doc.sections.map((s) => (
        <SectionView
          key={s.heading.id}
          section={s}
          level={2}
          open={open}
          onToggle={toggle}
          ctx={ctx}
        />
      ))}
    </article>
  );
}

export function GuideView() {
  const { page: slug = '' } = useParams({ strict: false }) as { page?: string };
  const { hash } = useLocation();
  const page = guidePage(slug);

  return (
    <div className="lm-guide">
      <nav aria-label="Guide pages" className="lm-guide-nav">
        <ul>
          {GUIDE_PAGES.map((p) => (
            <li key={p.slug}>
              <PageLink slug={p.slug}>{p.title}</PageLink>
            </li>
          ))}
        </ul>
      </nav>
      {page ? (
        // A page of its own state: what was open on one page means nothing on the next.
        <GuidePageView key={page.slug} page={page} hash={hash} />
      ) : (
        <article className="lm-guide-page">
          <h1>No such page</h1>
          <p>
            The guide has no page called <code>{slug}</code>.{' '}
            <PageLink slug="" className="link">
              Start from the beginning
            </PageLink>
            .
          </p>
        </article>
      )}
    </div>
  );
}
