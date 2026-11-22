import type { CompiledLayout, Layout } from '@layerbench/core';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGitHubSession } from '../auth/github-session.js';
import { HelpLink } from '../components/HelpLink.js';
import { Keyboard, typingCombos } from '../components/Keyboard.js';
import { formatShare } from '../engine/heat.js';
import { HELP } from '../guide/help.js';
import { toast } from '../state/toasts.js';
import { creditOf, EDITOR_MAX, editorName, imageFileName, loginName } from './credits.js';
import { rememberEditor, rememberedEditor } from './editor-name.js';
import { plain } from './plain-text.js';
import {
  type Composed,
  canCopyImage,
  composeCard,
  copyImage,
  downloadBlob,
  inlineBoard,
  type Palette,
  readPalette,
  renderPng,
  svgDataUrl,
} from './share-card.js';

/** One layout on the image: its first layer, with the heat the page shows it with. */
export interface ShareBoard {
  /** `A` or `B` when two layouts are on the image; null for one. */
  tag: string | null;
  layout: Pick<Layout, 'name' | 'author' | 'link'>;
  /** The layout as written, whose keys are drawn. */
  compiled: CompiledLayout;
  /** The layout as the analysis types it, whose combos are drawn. */
  typed: CompiledLayout;
  /** Position to 0–1 heat on the first layer, on the scale the page uses. */
  heat: Record<number, number>;
  /** The share of the typing the first layer does, 0–1; null when it is not known. */
  share: number | null;
  /** What is shown has changes that are saved nowhere. */
  unsaved: boolean;
  /** Whether the combos that type are drawn. */
  combos: boolean;
}

/** What an image is made from, as it stood when the user asked for it. */
export interface ShareImage {
  boards: ShareBoard[];
  /** What the colours measure, as the page names it. */
  heat: string;
  /** What else is true of the colours: `one scale for both layouts`. */
  heatNote: string | null;
  /** The text, the rules and the switches the numbers are made on. */
  settings: string;
}

/** The first layer's name as it goes on the image and in its description. */
const firstLayerName = (b: ShareBoard): string =>
  plain(b.compiled.layers[0]?.name ?? '') || 'Layer 1';

/**
 * What the preview shows, in words: each layout with its credit, the layer drawn, and what the
 * colours measure. The image's own text is not read out of an `<img>`, and the colours say what
 * keys are used most only to whoever sees them.
 */
function previewAlt(image: ShareImage, editor: string): string {
  const layouts = image.boards.map((b) => {
    const credit = creditOf(b.layout, { unsaved: b.unsaved, editor });
    return [
      `${b.tag ? `${b.tag}: ` : ''}${credit.name}`,
      credit.byline,
      credit.edits,
      `first layer, ${firstLayerName(b)}`,
    ]
      .filter(Boolean)
      .join(', ');
  });
  return `Preview of the image. ${layouts.join('. ')}. Keys are coloured by ${image.heat}, from none to the busiest key.`;
}

type Prepared = { palette: Palette; boards: SVGSVGElement[] };

/**
 * The image of a layout, or of two compared, to be shared where a link will not do: a post, a chat.
 * It shows the image as it will be saved, and asks one thing, for a version that is not saved: who
 * made the edits, which the image says beside the layout's author, so the author is not taken for
 * having made them. It is a native `<dialog>`, as the other dialogs are, and is mounted while it
 * is open.
 *
 * The boards are drawn here, out of sight, by the same component the page draws them with, then
 * copied into the image (`inlineBoard`), so what is saved is what the page shows.
 */
export function ShareImageDialog({ image, onClose }: { image: ShareImage; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const probes = useRef<SVGSVGElement>(null);
  const titleId = useId();
  const editorId = useId();
  const editorHint = useId();
  const login = useGitHubSession((s) => s.login);

  // Whoever is signed in made the edits they share, unless they say otherwise; a name typed
  // before is theirs to keep.
  const [typed, setTyped] = useState(() => rememberedEditor() ?? loginName(login));
  const editor = editorName(typed);
  const edited = image.boards.some((b) => b.unsaved);
  // Which of the layouts the hint is about: all, or the one of two that is not saved.
  const unsavedBoards = image.boards.filter((b) => b.unsaved);
  const whoseEdits =
    unsavedBoards.length < image.boards.length
      ? `Layout ${unsavedBoards.map((b) => b.tag).join(' and ')} has`
      : image.boards.length > 1
        ? 'These layouts have'
        : 'This layout has';

  const combos = useMemo(
    () => image.boards.map((b) => (b.combos ? typingCombos(b.typed, 0) : [])),
    [image],
  );

  // The boards are on the page now, drawn: copy them once, whatever is typed in the field.
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    const host = stage.current;
    const probe = probes.current;
    if (!host || !probe) return;
    try {
      const boards = image.boards.map((_, i) => {
        const svg = host.querySelector<SVGSVGElement>(`[data-share-board="${i}"] > svg`);
        if (!svg) throw new Error('The board could not be drawn.');
        return inlineBoard(svg);
      });
      setPrepared({ palette: readPalette(probe), boards });
      setFailure(null);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }, [image]);

  // A card that cannot be made is said, not thrown into the page: a name from a link is not
  // trusted to be one the card can hold (`plain` makes most so, and this is what is left).
  const made = useMemo((): { card: Composed; preview: string } | { error: string } | null => {
    if (!prepared) return null;
    try {
      const composed = composeCard({
        boards: image.boards.map((b, i) => ({
          svg: prepared.boards[i] as SVGSVGElement,
          tag: b.tag,
          credit: creditOf(b.layout, { unsaved: b.unsaved, editor }),
          layer: firstLayerName(b),
          share: b.share === null ? null : `${formatShare(b.share)} of presses`,
        })),
        heat: image.heat,
        heatNote: image.heatNote,
        settings: image.settings,
        palette: prepared.palette,
      });
      return { card: composed, preview: svgDataUrl(composed.svg) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [prepared, image, editor]);
  const card = made && 'card' in made ? made.card : null;
  const preview = made && 'card' in made ? made.preview : null;
  // Made for what it is made from, not on every render: it names every layout and its credit.
  const alt = useMemo(() => previewAlt(image, editor), [image, editor]);
  const problem = failure ?? (made && 'error' in made ? made.error : null);

  // The PNG is made a moment after the last change to the card, so typing a name does not make
  // one for every letter; the buttons wait for it, so a click has an image in hand to give.
  const [png, setPng] = useState<Blob | null>(null);
  useEffect(() => {
    setPng(null);
    if (!card) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      renderPng(card)
        .then((blob) => {
          if (!cancelled) setPng(blob);
        })
        .catch((e) => {
          if (!cancelled) setFailure(e instanceof Error ? e.message : String(e));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [card]);

  const fileName = imageFileName(image.boards.map((b) => b.layout.name));
  const preparing = png === null && problem === null;

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
      <div className="modal-box max-w-4xl space-y-3">
        <div className="flex items-center gap-2">
          <h2 id={titleId} className="font-semibold text-base">
            Export image
          </h2>
          <HelpLink help={HELP.shareImage} />
        </div>
        <p className="text-xs opacity-70">
          {image.boards.length > 1 ? 'Each layout’s first layer' : 'The first layer'}, with its heat
          and its credits, as an image to post in a thread or a chat.
        </p>

        {edited && (
          <div className="form-control min-w-0 sm:max-w-sm">
            <label htmlFor={editorId} className="label-text text-xs">
              Unsaved edits by
            </label>
            <input
              id={editorId}
              className="input input-sm input-bordered"
              value={typed}
              maxLength={EDITOR_MAX}
              placeholder="your name or @handle"
              aria-describedby={editorHint}
              autoComplete="off"
              onChange={(e) => {
                setTyped(e.target.value);
                rememberEditor(e.target.value);
              }}
            />
            <p id={editorHint} className="mt-1 text-xs opacity-70">
              {whoseEdits} changes that are not saved, so the image names who made them beside the
              author. Leave it empty to name no one.
            </p>
          </div>
        )}

        {problem !== null && (
          <p role="alert" className="alert alert-error text-sm">
            {problem}
          </p>
        )}

        {preview && card && (
          <img
            src={preview}
            width={card.width}
            height={card.height}
            alt={alt}
            // Capped in height so the buttons stay in reach: a layout with two boards is tall.
            className="mx-auto block h-auto w-auto max-h-[55vh] max-w-full rounded-box border border-base-300"
          />
        )}

        <div className="modal-action items-center">
          {preparing && (
            <span className="mr-auto flex items-center gap-2 text-xs opacity-70" role="status">
              <span className="loading loading-dots loading-xs" />
              Preparing the image…
            </span>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
          {canCopyImage() && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={png === null}
              onClick={() => {
                if (!png) return;
                copyImage(png).then(
                  () => toast.info('Copied the image — paste it into your post or chat'),
                  () => toast.error('The browser would not copy the image — download it instead'),
                );
              }}
            >
              Copy image
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={png === null}
            onClick={() => {
              if (png) downloadBlob(png, fileName);
            }}
          >
            Download PNG
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>

      {/* Out of sight, not out of the page: the boards must be laid out for their styles to be
          read. The page's own `Keyboard` draws them, so they are what the page shows. */}
      <div ref={stage} aria-hidden="true" className="lb-share-stage">
        {image.boards.map((b, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the boards are a fixed list, one or two
            key={i}
            data-share-board={i}
          >
            <Keyboard
              id={`kb-share-${i}`}
              compiled={b.compiled}
              layer={0}
              heat={b.heat}
              combos={combos[i]}
              interactive={false}
              legendList={false}
            />
          </div>
        ))}
        <svg ref={probes} width="0" height="0" />
      </div>
    </dialog>
  );
}
