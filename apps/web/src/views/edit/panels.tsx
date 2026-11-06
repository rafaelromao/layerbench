import {
  addableKeys,
  type Binding,
  boardKeys,
  type DoubledWay,
  type Edit,
  exportKeymapDrawer,
  freeCondition,
  GEOMETRY_PRESET_IDS,
  geometryWithKeys,
  keysInUse,
  LAYER_COLORS,
  type LayerColor,
  layerReachedFrom,
  legend,
  plainPath,
  reachKeys,
  rulesOf,
  type ShiftWay,
  type SpecialFeature,
  type SpecialFeatureKind,
  shiftWaysOffered,
  slug,
  specialFeatures,
  toCanonicalJson,
} from '@layerbench/core';
import {
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Keyboard } from '../../components/Keyboard.js';
import { layerColourOf } from '../../components/layer-colour.js';
import type { ProducerDTO } from '../../engine/protocol.js';
import { toast } from '../../state/toasts.js';
import { Carousel, CarouselHint, Keycap, revealInCarousel, Slide } from './Carousel.js';
import { LayerChips, Segment, TextField } from './inspector/controls.js';
import { type EditAction, type EditState, shownLayer } from './reducer.js';

type Send = Dispatch<EditAction>;

interface PanelProps {
  state: EditState;
  send: Send;
}

const COLOUR_NAMES: Record<LayerColor, string> = {
  blue: 'Blue',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  violet: 'Violet',
  teal: 'Teal',
  lime: 'Lime',
};

/**
 * The colour a layer is drawn in, a circle for each as one group of radios: Automatic, the one its
 * place in the list gives it, or one of the palette's, each tuned for both themes. The one picked
 * wears a ring and a check, so it reads without its colour; Automatic is dashed, filled with the
 * colour the layer has by its place, which is the text colour for the base layer.
 */
function LayerColourPicker({
  layerName,
  index,
  value,
  onChange,
}: {
  layerName: string;
  index: number;
  value: LayerColor | undefined;
  onChange: (color: LayerColor | undefined) => void;
}) {
  const name = useId();
  const options: readonly (readonly [LayerColor | undefined, string])[] = [
    [undefined, 'Automatic'],
    ...LAYER_COLORS.map((c) => [c, COLOUR_NAMES[c]] as const),
  ];
  return (
    <div role="radiogroup" aria-label={`Colour of layer ${layerName}`} className="lb-layer-colours">
      {options.map(([color, text]) => (
        <label
          key={color ?? 'automatic'}
          className="lb-colour"
          title={
            color
              ? text
              : `Automatic: ${index === 0 ? 'the text colour' : 'by its place in the list'}`
          }
        >
          <input
            type="radio"
            name={name}
            aria-label={text}
            className={color ? 'lb-colour-radio' : 'lb-colour-radio lb-colour-auto'}
            style={{ '--lb-colour': layerColourOf(index, color) } as CSSProperties}
            checked={value === color}
            onChange={() => onChange(color)}
          />
        </label>
      ))}
    </div>
  );
}

/**
 * Layers: their names and their order, then the conditions that bring a layer on by themselves, and
 * last the two cards that make one more of either. Order matters for one thing — when two layers
 * are on at once, a key comes from the one further along — and the base layer, which every key
 * falls back to, stays first. Dragging a card moves it; the arrows do the same without a pointer.
 */
export function LayersPanel({ state, send }: PanelProps) {
  const [newLayer, setNewLayer] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const layers = state.layout.layers;
  const conditions = state.layout.conditionalLayers?.length ?? 0;
  const nameOf = (i: number) => layers[i].name ?? layers[i].id;
  const panel = useRef<HTMLDivElement>(null);
  // A layer or a condition added lands before the cards that add them, which move on with it: it is
  // brought into view, so what was just made is not left off to the side. The board turns to a new
  // layer, a copy of one included, which is where it stands.
  const counts = useRef({ layers: layers.length, conditions });
  useEffect(() => {
    const before = counts.current;
    counts.current = { layers: layers.length, conditions };
    const added =
      layers.length > before.layers
        ? `[data-layer="${state.layer}"]`
        : conditions > before.conditions
          ? `[data-condition="${conditions - 1}"]`
          : null;
    const slide = added && panel.current?.querySelector<HTMLElement>(added);
    if (slide) revealInCarousel(slide);
  }, [layers.length, conditions, state.layer]);

  return (
    <div ref={panel} className="space-y-2 min-w-0">
      <Carousel label="Layers">
        {layers.map((layer, i) => (
          <Slide
            key={layer.id}
            data-layer={i}
            draggable={i > 0}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(i));
              e.dataTransfer.effectAllowed = 'move';
              setDragging(i);
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => {
              if (dragging !== null && i > 0) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData('text/plain'));
              setDragging(null);
              const moved = layers[from]?.id;
              if (Number.isInteger(from) && moved) {
                send({ type: 'edit', edit: { kind: 'moveLayer', layer: moved, to: i } });
              }
            }}
            // Its band and its number are the colour its keys are drawn in on the board.
            style={{ '--lb-accent': layerColourOf(i, layer.color) } as CSSProperties}
            className={`lb-slide-wide lb-slide-accent lb-layer-slide ${dragging === i ? 'opacity-50' : ''}`}
          >
            <div className="lb-layer-head">
              <span
                aria-hidden="true"
                className={`lb-layer-no ${i === 0 ? 'lb-layer-no-base' : ''}`}
              >
                {i + 1}
              </span>
              <TextField
                label={`Name of layer ${nameOf(i)}`}
                value={layer.name ?? layer.id}
                className="input-xs w-full"
                mono={false}
                onCommit={(name) =>
                  send({ type: 'edit', edit: { kind: 'renameLayer', layer: layer.id, name } })
                }
              />
            </div>
            <div className="lb-layer-meta">
              <LayerColourPicker
                layerName={nameOf(i)}
                index={i}
                value={layer.color}
                onChange={(color) =>
                  send({ type: 'edit', edit: { kind: 'colorLayer', layer: layer.id, color } })
                }
              />
            </div>
            <div className="lb-layer-foot">
              <div className="lb-layer-moves">
                {i === 0 ? (
                  <span className="badge badge-ghost badge-sm">base</span>
                ) : (
                  <>
                    <span aria-hidden="true" className="lb-layer-grip" title="Drag to move">
                      ⠿
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square"
                      aria-label={`Move ${nameOf(i)} left`}
                      disabled={i <= 1}
                      onClick={() =>
                        send({
                          type: 'edit',
                          edit: { kind: 'moveLayer', layer: layer.id, to: i - 1 },
                        })
                      }
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square"
                      aria-label={`Move ${nameOf(i)} right`}
                      disabled={i === layers.length - 1}
                      onClick={() =>
                        send({
                          type: 'edit',
                          edit: { kind: 'moveLayer', layer: layer.id, to: i + 1 },
                        })
                      }
                    >
                      →
                    </button>
                  </>
                )}
              </div>
              <div className="lb-layer-edits">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square"
                  aria-label={`Duplicate ${nameOf(i)}`}
                  title="Duplicate"
                  onClick={() =>
                    send({ type: 'edit', edit: { kind: 'duplicateLayer', layer: layer.id } })
                  }
                >
                  ⧉
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square"
                  aria-label={`Remove ${nameOf(i)}`}
                  title={i === 0 ? 'The base layer cannot be removed' : 'Remove'}
                  disabled={i === 0}
                  // A layer still in use is refused with the keys that use it.
                  onClick={() =>
                    send({ type: 'edit', edit: { kind: 'removeLayer', layer: layer.id } })
                  }
                >
                  ✕
                </button>
              </div>
            </div>
          </Slide>
        ))}

        <ConditionCards state={state} send={send} />

        <Slide className="lb-slide-new">
          <form
            className="flex w-full flex-col items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              send({ type: 'edit', edit: { kind: 'addLayer', name: newLayer } });
              setNewLayer('');
            }}
          >
            <span aria-hidden="true" className="lb-slide-new-mark">
              +
            </span>
            <span className="lb-slide-title">New layer</span>
            <input
              aria-label="New layer name"
              placeholder={`Layer ${layers.length + 1}`}
              className="input input-xs input-bordered w-full"
              value={newLayer}
              onChange={(e) => setNewLayer(e.target.value)}
            />
            <button type="submit" className="btn btn-xs">
              Add layer
            </button>
          </form>
        </Slide>

        <NewConditionCard state={state} send={send} />
      </Carousel>
      <CarouselHint>
        When two layers are on at once, a key comes from the one further right. The first is the
        base layer, which every key falls back to. A condition brings a layer on while the layers it
        waits for are on, as ZMK's conditional layers do.
      </CarouselHint>
    </div>
  );
}

/**
 * Layers that come on by themselves while others are on, as ZMK's conditional layers: Extras while
 * Numbers and Symbols are both held. Each condition lists the layers it waits for, and the one it
 * brings on, in a card of its own.
 */
function ConditionCards({ state, send }: PanelProps) {
  const layers = state.layout.layers;
  const conditions = state.layout.conditionalLayers ?? [];
  const base = layers[0]?.id ?? '';
  const others = layers.slice(1);
  const nameOf = (id: string) => layers.find((l) => l.id === id)?.name ?? id;
  const placeOf = (id: string) => layers.findIndex((l) => l.id === id);
  const edit = (e: Edit) => send({ type: 'edit', edit: e });
  const toggle = (list: readonly string[], id: string) =>
    list.includes(id) ? list.filter((l) => l !== id) : [...list, id];
  return conditions.map((c, i) => {
    // A layer later in the list is drawn over an earlier one, so one brought on before a
    // layer it waits for shows only where that layer's keys let it through.
    const over = c.if.filter((id) => placeOf(id) > placeOf(c.then));
    // A layer a condition brings on comes on no other way: what reaches it stops doing so.
    const reaching = layerReachedFrom(state.layout, c.then, { tested: false });
    return (
      <Slide
        // biome-ignore lint/suspicious/noArrayIndexKey: the place is what a slide edits, and a key of its layers would change with each edit, the slide losing focus
        key={i}
        // The band is the colour of the layer it brings on.
        style={
          {
            '--lb-accent': layerColourOf(placeOf(c.then), layers[placeOf(c.then)]?.color),
          } as CSSProperties
        }
        data-condition={i}
        className="lb-slide-wide lb-slide-accent space-y-1"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="lb-slide-title">Condition {i + 1}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            aria-label={`Remove the condition for ${nameOf(c.then)}`}
            onClick={() => edit({ kind: 'removeConditionalLayer', condition: i })}
          >
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span>while</span>
          <LayerChips
            compiled={state.compiled}
            label={`Layers ${nameOf(c.then)} waits for`}
            value={c.if}
            omit={[base, c.then]}
            onChange={(id) =>
              edit({ kind: 'updateConditionalLayer', condition: i, if: toggle(c.if, id) })
            }
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span>bring on</span>
          <select
            aria-label={`Layer condition ${i + 1} brings on`}
            className="select select-xs w-auto min-w-0"
            value={c.then}
            onChange={(e) =>
              edit({ kind: 'updateConditionalLayer', condition: i, then: e.target.value })
            }
          >
            {others.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name ?? l.id}
              </option>
            ))}
          </select>
        </div>
        {over.length > 0 && (
          <p className="text-[11px] text-warning">
            {nameOf(c.then)} comes before {over.map(nameOf).join(' and ')} in the list, so their
            keys cover it: move it after them.
          </p>
        )}
        {reaching.length > 0 && (
          <p className="text-[11px] text-warning">
            {nameOf(c.then)} comes on only by this condition, so these no longer bring it on:{' '}
            {reaching.join(', ')}.
          </p>
        )}
      </Slide>
    );
  });
}

/** The card that adds a condition, with the reason it cannot when no layer is left for one. */
function NewConditionCard({ state, send }: PanelProps) {
  const free = freeCondition(state.layout);
  const noneFree = useId();
  return (
    <Slide className="lb-slide-new">
      <button
        type="button"
        className="lb-slide-new-button"
        disabled={!free}
        aria-describedby={free ? undefined : noneFree}
        onClick={() =>
          free && send({ type: 'edit', edit: { kind: 'addConditionalLayer', ...free } })
        }
      >
        <span aria-hidden="true" className="lb-slide-new-mark">
          +
        </span>
        <span className="lb-slide-title">New condition</span>
      </button>
      {!free && (
        <p id={noneFree} className="text-[11px] opacity-70">
          {state.layout.layers.length < 3
            ? 'A condition needs two layers besides the base one.'
            : 'Every layer besides the base one comes on by a condition or is waited for by one.'}
        </p>
      )}
    </Slide>
  );
}

/**
 * How the layout's one-shot layers or keys release: as soon as the next key goes down, whether a
 * modifier held meanwhile is let through, and after how long unused. A one-shot key of its own may
 * still say otherwise; the values shown are what the analysis uses.
 */
function OneShotDefaults({
  which,
  title,
  state: { layout, compiled },
  send,
}: PanelProps & { which: 'sl' | 'sk'; title: string }) {
  const shown = compiled.behaviorDefaults[which];
  const set = (field: 'quickRelease' | 'ignoreModifiers' | 'releaseAfterMs', value: unknown) =>
    send({
      type: 'edit',
      edit: {
        kind: 'setBehaviorDefaults',
        defaults: {
          ...layout.behaviorDefaults,
          [which]: { ...layout.behaviorDefaults?.[which], [field]: value },
        },
      },
    });
  return (
    <Slide className="lb-slide-wide">
      <fieldset className="space-y-1" aria-label={title}>
        <legend className="lb-slide-title">{title}</legend>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={shown.quickRelease}
            onChange={(e) => set('quickRelease', e.target.checked)}
          />
          Release as the next key goes down
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={shown.ignoreModifiers}
            onChange={(e) => set('ignoreModifiers', e.target.checked)}
          />
          Stay on while a modifier is pressed
        </label>
        <label className="flex items-center gap-2 text-xs">
          Release after
          <input
            type="number"
            min={0}
            step={50}
            aria-label={`${title}: release after, in milliseconds`}
            className="input input-xs input-bordered w-20"
            value={shown.releaseAfterMs}
            onChange={(e) => {
              const ms = Number(e.target.value);
              if (Number.isFinite(ms) && ms >= 0) set('releaseAfterMs', ms);
            }}
          />
          ms
        </label>
      </fieldset>
    </Slide>
  );
}

/** The most a key unit of the board of the Configuration tab takes, in pixels. */
const GEO_UNIT = 30;
/**
 * The height the board has in its slide, in pixels: a taller board has smaller keys, and the
 * tallest, the columnar ones, still have keys of 24px, which a finger can hit.
 */
const GEO_BOARD_HEIGHT = 114;

/**
 * The board's keys, each one to take away, and beside them the places a key can be added. A key
 * can go only when it does nothing on any layer, which a key in use says by being disabled.
 */
function GeometryBoard({ state, send }: PanelProps) {
  const { layout } = state;
  const keys = useMemo(() => boardKeys(layout), [layout]);
  const addable = useMemo(() => addableKeys(layout), [layout]);
  const used = useMemo(() => keysInUse(layout), [layout]);
  const [stays, setStays] = useState<string | null>(null);
  const all = [...keys, ...addable];
  const left = Math.min(...all.map((k) => k.x - k.w / 2));
  const top = Math.min(...all.map((k) => k.y - k.h / 2));
  const width = Math.max(...all.map((k) => k.x + k.w / 2)) - left;
  const height = Math.max(...all.map((k) => k.y + k.h / 2)) - top;
  const unit = Math.min(GEO_UNIT, GEO_BOARD_HEIGHT / height);
  const place = (k: (typeof all)[number]) => ({
    left: (k.x - k.w / 2 - left) * unit,
    top: (k.y - k.h / 2 - top) * unit,
    width: k.w * unit - 1,
    height: k.h * unit - 1,
    transform: k.rotation ? `rotate(${k.rotation}deg)` : undefined,
  });
  const set = (change: Parameters<typeof geometryWithKeys>[1]) =>
    send({
      type: 'edit',
      edit: { kind: 'setGeometry', geometry: geometryWithKeys(layout, change) },
    });
  return (
    // The slide is as wide as the board, and the padding (2 × 12px) and border (2 × 1px) it adds.
    <Slide className="space-y-1" style={{ width: Math.max(width * unit, 220) + 26 }}>
      <span className="lb-slide-title">Keys</span>
      <fieldset
        className="lb-geo"
        aria-label="Keys of the board"
        style={{ width: width * unit, height: height * unit }}
      >
        {keys.map((k) => {
          const why = used.get(k.id);
          return (
            <button
              key={k.id}
              type="button"
              className="lb-geo-key"
              style={place(k)}
              aria-disabled={why !== undefined}
              aria-label={`Remove key ${k.id}`}
              title={why === undefined ? `Take ${k.id} away` : `${k.id} stays: ${why}`}
              onClick={() => {
                // A key in use says why it stays, where a finger or a keyboard can read it.
                setStays(why === undefined ? null : `${k.id} stays: ${why}.`);
                if (why === undefined) set({ remove: [k.id] });
              }}
            >
              {k.id}
            </button>
          );
        })}
        {addable.map((k) => (
          <button
            key={k.id}
            type="button"
            className="lb-geo-key lb-geo-key-add"
            style={place(k)}
            aria-label={`Add key ${k.id}`}
            title={`Add ${k.id}`}
            onClick={() => set({ add: [k] })}
          >
            +
          </button>
        ))}
      </fieldset>
      {stays && (
        <p role="status" className="text-[11px]">
          {stays}
        </p>
      )}
    </Slide>
  );
}

/**
 * Configuration: the preset, the board's keys, and how the layout's one-shot layers and keys end, a
 * card each. Which keys are space and shift is not set here: they are the keys that type a space and
 * shift. How a capital and a doubled letter are typed is in Typing paths.
 */
export function ConfigurationPanel({ state, send }: PanelProps) {
  const { layout } = state;
  const preset = 'preset' in layout.geometry ? layout.geometry.preset : 'custom';
  return (
    <div className="space-y-2 min-w-0">
      <Carousel label="Configuration">
        <Slide className="lb-slide-wide space-y-1.5">
          <label className="block space-y-1.5">
            <span className="lb-slide-title block">Preset</span>
            <select
              aria-label="Physical layout preset"
              className="select select-sm select-bordered w-full"
              value={preset}
              onChange={(e) =>
                send({
                  type: 'edit',
                  edit: {
                    kind: 'setGeometry',
                    geometry: {
                      preset: e.target.value,
                      // The stagger chosen for the columns stays, on a board that has columns.
                      ...('preset' in layout.geometry && layout.geometry.columnOffsets
                        ? { columnOffsets: layout.geometry.columnOffsets }
                        : {}),
                    },
                  },
                })
              }
            >
              {GEOMETRY_PRESET_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
              {preset === 'custom' && (
                <option value="custom" disabled>
                  custom
                </option>
              )}
            </select>
            <span className="block text-[11px] opacity-60">
              Another preset keeps every key that does something, and is refused if it would lose
              one.
            </span>
          </label>
        </Slide>

        <GeometryBoard state={state} send={send} />
        <OneShotDefaults which="sl" title="One-shot layers" state={state} send={send} />
        <OneShotDefaults which="sk" title="One-shot keys" state={state} send={send} />
      </Carousel>
      <CarouselHint>
        Tap a key to take it away, or a + to add one. A key can go only when it is Transparent or
        None on every layer and nothing else uses it. The one-shot cards say how the layout's
        one-shots end.
      </CarouselHint>
    </div>
  );
}

/**
 * Combos: a strip of small boards, one for each combo, with the combo's keys marked and what it
 * types under them. Picking one opens it in the combo editor, with the same controls as a key. The
 * last card makes a new one: pick its keys on the board, add it, and give it an output there.
 *
 * A combo opened from anywhere else, such as its box on the board, is brought into view in the
 * strip and takes focus there, so the card and the board name the same one.
 */
export function CombosPanel({
  state,
  send,
  onShow,
}: PanelProps & {
  /** Before a combo is shown on the board: a word playing there would hide it. */
  onShow?: () => void;
}) {
  const { compiled, layout } = state;
  const combos = layout.combos ?? [];
  const layerName = compiled.layers[state.layer].name;
  const picking = state.comboPick !== null && state.comboPickFor === null;
  const chosen = state.comboPick ?? [];
  const panel = useRef<HTMLElement>(null);
  // The picks made when the tab came up: a combo open then is shown, but not taken focus for, so
  // arrowing between tabs keeps focus on the tab.
  const seenPicks = useRef(state.comboPicks);
  // Brought into view, and given focus, each time a combo is picked, wherever it is picked from: the
  // card, a box on the board, a new combo added. An Undo or a removal that moves the open combo is
  // no pick, and takes no focus from the button that was pressed. The combo is read as it stands
  // when a pick lands: the pick is what this answers to.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (state.combo === null) return;
    const card = panel.current?.querySelector<HTMLElement>(`[data-combo="${state.combo}"]`);
    if (!card) return;
    revealInCarousel(card);
    if (seenPicks.current !== state.comboPicks) {
      card.querySelector<HTMLElement>('.lb-combo-slide-pick')?.focus({ preventScroll: true });
    }
    seenPicks.current = state.comboPicks;
  }, [state.comboPicks]);
  return (
    <section ref={panel} className="space-y-2 min-w-0" aria-label="Combos">
      <Carousel label="Combo boards">
        {combos.map((c, i) => {
          const name = c.keys.join('+');
          const shown = legend(compiled, c.binding);
          const layerIds = c.layers ?? layout.layers.map((l) => l.id);
          const on = compiled.layerIndex.get(layerIds[0]) ?? 0;
          const open = state.combo === i;
          const layersText =
            layerIds.length === layout.layers.length
              ? 'every layer'
              : layerIds.map((id) => layout.layers.find((l) => l.id === id)?.name ?? id).join(', ');
          return (
            // By place: a custom layout can hold two combos under one id.
            // biome-ignore lint/suspicious/noArrayIndexKey: the place is what a card edits
            <Slide key={i} current={open} className="lb-combo-slide lb-slide-pick" data-combo={i}>
              <button
                type="button"
                className="lb-combo-slide-pick"
                aria-label={`Edit ${name}`}
                aria-pressed={open}
                // The board turns to the first layer the combo works on, as its card is drawn, so
                // the combo is there to be seen selected. Closing it leaves the board as it is.
                onClick={() => {
                  if (!open) onShow?.();
                  send(
                    open
                      ? { type: 'selectCombo', combo: null }
                      : { type: 'selectCombo', combo: i, layer: on },
                  );
                }}
              >
                <span className="lb-combo-slide-board">
                  <Keyboard
                    compiled={compiled}
                    layer={on}
                    highlight={c.keys.flatMap((k) => compiled.keyIndex.get(k) ?? [])}
                    interactive={false}
                    className="w-full"
                  />
                </span>
                <span className="lb-combo-slide-foot">
                  <Keycap small symbol={shown.tap || '·'} hold={shown.hold || undefined} />
                  <span className="lb-combo-slide-text">
                    <span className="lb-combo-slide-keys font-mono">{name}</span>
                    <span className="lb-combo-slide-layers" title={layersText}>
                      {layersText}
                    </span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs lb-slide-remove"
                aria-label={`Remove ${name}`}
                onClick={() => send({ type: 'edit', edit: { kind: 'removeCombo', combo: i } })}
              >
                ✕
              </button>
            </Slide>
          );
        })}
        <Slide className="lb-slide-new">
          {picking ? (
            <div className="flex w-full flex-col gap-2">
              <output aria-label="Combo keys picked" className="font-mono text-xs">
                {chosen.length > 0 ? chosen.join('+') : 'Click the keys on the board'}
              </output>
              <button
                type="button"
                className="btn btn-xs btn-primary"
                disabled={chosen.length < 2}
                onClick={() => {
                  send({
                    type: 'edit',
                    edit: {
                      kind: 'addCombo',
                      layer: shownLayer(state),
                      keys: chosen,
                      binding: { kind: 'none' },
                    },
                  });
                  // The new combo is last: open it, to give it an output.
                  send({ type: 'selectCombo', combo: combos.length });
                }}
              >
                Add combo on {layerName}
              </button>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => send({ type: 'comboPickCancel' })}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="lb-slide-new-button"
              onClick={() => send({ type: 'comboPickStart' })}
            >
              <span aria-hidden="true" className="lb-slide-new-mark">
                +
              </span>
              <span>New combo</span>
            </button>
          )}
        </Slide>
      </Carousel>
      <CarouselHint>
        A combo types when its keys go down together. Pick one to edit it on the board below, or add
        a new one.
      </CarouselHint>
    </section>
  );
}

/**
 * Each kind of special feature, in the order the panel lists them, what a slide of it says, and the
 * theme colour of its band.
 */
const FEATURE_GROUPS: [SpecialFeatureKind, string, string][] = [
  ['adaptive', 'Adaptive key', 'primary'],
  ['alt_repeat', 'Alt repeat', 'secondary'],
  ['macro', 'Macro', 'accent'],
  ['mod_morph', 'Mod morph', 'info'],
];

/**
 * The layout's special features, a slide each, kind by kind, on a key that shows what
 * the feature's key or combo types: every use names its layer and key, or its combo, and picking it
 * shows it on the board under the strip — the key selected on its layer, or the combo open, as the
 * Combos tab opens one. The slide of the key or combo open is the current one, brought into view in
 * the strip however it was picked, a click on the board included.
 */
function useFeatureSlides(
  state: EditState,
  send: Send,
  panel: RefObject<HTMLElement | null>,
  onShow?: () => void,
): ReactNode[] {
  const features = useMemo(() => specialFeatures(state.layout), [state.layout]);
  const { compiled } = state;
  /** Where a feature is, as the board has it open: a key on its layer, or a combo. */
  const placeAt = (f: SpecialFeature) =>
    f.combo !== undefined ? `combo ${f.comboIndex}` : `${f.layer} ${f.key}`;
  const openAt =
    state.combo !== null
      ? `combo ${state.combo}`
      : state.selected === null
        ? ''
        : `${compiled.layers[state.layer]?.id} ${state.selected}`;
  // Whether the open key or combo has a slide here: one that appears for it, as a key is given a
  // macro, is brought into view too.
  const hasSlide = features.some((f) => placeAt(f) === openAt);
  useEffect(() => {
    if (openAt === '' || !hasSlide) return;
    // A key can hold two features: the first of its slides is the one brought into view.
    const slides = panel.current?.querySelectorAll<HTMLElement>('[data-at]') ?? [];
    const slide = [...slides].find((s) => s.dataset.at === openAt);
    if (slide) revealInCarousel(slide);
  }, [panel, openAt, hasSlide]);
  const show = (f: SpecialFeature) => {
    onShow?.();
    // Whatever the board is doing gives way: a pick of a combo's keys would keep its clicks, and an
    // armed swap would add its key to the one shown.
    send({ type: 'comboPickCancel' });
    send({ type: 'cancelSwap' });
    if (f.combo !== undefined) {
      const combo = f.comboIndex === undefined ? undefined : state.layout.combos?.[f.comboIndex];
      if (f.comboIndex === undefined || combo === undefined) return;
      // The board turns to the first layer the combo works on, as the Combos tab does.
      const first = combo.layers?.[0] ?? state.layout.layers[0]?.id;
      send({
        type: 'selectCombo',
        combo: f.comboIndex,
        layer: first === undefined ? 0 : (compiled.layerIndex.get(first) ?? 0),
      });
      return;
    }
    const layer = f.layer === undefined ? undefined : compiled.layerIndex.get(f.layer);
    if (layer === undefined || f.key === undefined) return;
    send({ type: 'selectLayer', layer });
    send({ type: 'keyClick', keyId: f.key });
  };
  /**
   * What the feature types, as the board would draw it: its key, or its combo. A use inside one of
   * the key's other branches, such as the macro an alt repeat types after a letter, is not what its
   * key is drawn as, so it is drawn as what it types itself.
   */
  const typedBy = (f: SpecialFeature) => {
    let binding: Binding | undefined;
    let held: Binding | undefined;
    if (f.combo !== undefined) {
      held = f.comboIndex === undefined ? undefined : state.layout.combos?.[f.comboIndex]?.binding;
      binding = held;
    } else {
      const layer = f.layer === undefined ? undefined : compiled.layerIndex.get(f.layer);
      const key = f.key === undefined ? undefined : compiled.keyIndex.get(f.key);
      binding =
        layer === undefined || key === undefined ? undefined : compiled.layers[layer].bindings[key];
      const bindings = layer === undefined ? undefined : state.layout.layers[layer]?.bindings;
      held = f.key === undefined ? undefined : (bindings?.[f.key] ?? bindings?.['*']);
    }
    if (held && !plainPath(held).includes(f.binding)) binding = f.binding;
    return binding ? legend(compiled, binding) : null;
  };
  const placeOf = (f: SpecialFeature) => {
    if (f.combo !== undefined) return `Combo ${f.combo}`;
    const layer = f.layer === undefined ? undefined : compiled.layerIndex.get(f.layer);
    return `${layer === undefined ? f.layer : compiled.layers[layer].name} · ${f.key}`;
  };

  return FEATURE_GROUPS.flatMap(([kind, title, accent]) =>
    features
      .filter((f) => f.feature === kind)
      .map((f, i) => {
        const at = placeAt(f);
        const current = at === openAt;
        const typed = typedBy(f);
        return (
          <Slide
            // biome-ignore lint/suspicious/noArrayIndexKey: one key can hold a feature twice
            key={`${kind}-${f.layer}-${f.key}-${f.combo}-${f.label}-${i}`}
            current={current}
            data-at={at}
            style={{ '--lb-accent': `var(--color-${accent})` } as CSSProperties}
            className="lb-slide-wide lb-slide-accent lb-slide-pick"
          >
            <button
              type="button"
              className="lb-slide-button"
              aria-current={current ? 'true' : undefined}
              onClick={() => show(f)}
            >
              <Keycap
                small
                aria-hidden="true"
                symbol={typed?.tap || '·'}
                hold={typed?.hold || undefined}
              />
              <span className="lb-behavior-text">
                <span className="font-mono text-xs opacity-70">{placeOf(f)}</span>
                <span className="lb-behavior-label">{f.label}</span>
                {/* The kind, where the name does not already say it. */}
                {f.label.toLowerCase() !== title.toLowerCase() && (
                  <span className="lb-behavior-kind">{title}</span>
                )}
              </span>
            </button>
          </Slide>
        );
      }),
  );
}

/**
 * Special Behaviors: every use of an adaptive key, alt repeat, macro, mod morph and sentence space,
 * a card each, to pick and see on the board.
 */
export function BehaviorsPanel({
  state,
  send,
  onShow,
}: PanelProps & {
  /** Before a feature is shown on the board: a word playing there would hide it. */
  onShow?: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const slides = useFeatureSlides(state, send, panel, onShow);
  return (
    <section ref={panel} className="space-y-2 min-w-0" aria-label="Special features">
      <Carousel label="Special behaviors">
        {slides.length === 0 && (
          <Slide className="lb-slide-wide text-xs">
            This layout has no adaptive keys, alt repeats, macros, mod morphs or sentence spaces.
          </Slide>
        )}
        {slides}
      </Carousel>
      <CarouselHint>
        Pick a use to see it on the board below: its layer turned up with the key selected, or the
        combo open. Adaptive keys, alt repeats and sentence spaces need a ZMK module, linked in the
        key editor.
      </CarouselHint>
    </section>
  );
}

/** One way of a typing path, as its row shows it. */
interface PathRow {
  id: string;
  label: string;
  enabled: boolean;
  /** Said where the cost goes: how many presses, or why the way is of no use here. */
  note?: string;
  /** Drawn like a code identifier: a producer's id, not a word. */
  mono?: boolean;
  title?: string;
  /** No key of the layout does this: the way stays in the list, dimmed and marked. */
  unavailable?: boolean;
  /** The one way on, which cannot be turned off. */
  locked?: boolean;
}

/**
 * The ways a character or a rule can be typed, a row each, in the order they are tried: a box to
 * turn it on or off, the order to drag or move with the arrows, and the way the analysis types it
 * marked, the first that is on and that some key gives.
 */
function PathList({
  scope,
  label,
  rows,
  dragging,
  setDragging,
  onToggle,
  onMove,
}: {
  /** Names the list among the others, so a drag cannot cross from one to another. */
  scope: string;
  label?: string;
  rows: PathRow[];
  dragging: string | null;
  setDragging: (at: string | null) => void;
  onToggle: (id: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  const used = rows.find((r) => r.enabled && !r.unavailable)?.id;
  return (
    <ol className="lb-path-list" aria-label={label}>
      {rows.map((row, i) => (
        <li
          key={row.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', String(i));
            e.dataTransfer.effectAllowed = 'move';
            setDragging(`${scope}:${i}`);
          }}
          onDragEnd={() => setDragging(null)}
          onDragOver={(e) => {
            if (dragging?.startsWith(`${scope}:`)) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData('text/plain'));
            setDragging(null);
            if (Number.isInteger(from)) onMove(from, i);
          }}
          className={`lb-path-row ${row.id === used ? 'lb-path-first' : ''} ${
            row.enabled ? '' : 'opacity-40'
          } ${row.unavailable && row.enabled ? 'opacity-60' : ''} ${
            dragging === `${scope}:${i}` ? 'opacity-50' : ''
          }`}
        >
          <span aria-hidden="true" className="opacity-40">
            ⠿
          </span>
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            aria-label={`Use ${row.label}`}
            checked={row.enabled}
            disabled={row.locked}
            title={row.locked ? 'At least one way has to stay on' : undefined}
            onChange={() => onToggle(row.id)}
          />
          <span
            className={`${row.mono ? 'font-mono ' : ''}flex-1 min-w-0 truncate`}
            title={row.title ?? row.label}
          >
            {row.label}
          </span>
          {row.note && <span className="lb-path-cost">{row.note}</span>}
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            aria-label={`Move ${row.label} up`}
            disabled={i === 0}
            onClick={() => onMove(i, i - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            aria-label={`Move ${row.label} down`}
            disabled={i === rows.length - 1}
            onClick={() => onMove(i, i + 1)}
          >
            ↓
          </button>
        </li>
      ))}
    </ol>
  );
}

const SHIFT_LABELS: Record<ShiftWay, string> = { sk: 'Sticky (one-shot)', hold: 'Hold' };
const DOUBLED_LABELS: Record<DoubledWay, string> = {
  repeatKey: 'Repeat key',
  tapTwice: 'Tap twice',
};

/**
 * Typing paths: how a capital and a doubled letter are typed, and which producer wins when a symbol
 * can be typed more than one way. Each is a slide drawn on a key at its left, the ways it can be
 * typed beside it, in the order they are tried: the two rules for the whole layout first.
 */
export function PathsPanel({
  state,
  send,
  producers,
}: PanelProps & { producers: Record<string, ProducerDTO[]> }) {
  // Which row is in flight, as `list:index`, so a drag cannot cross from one list to another.
  const [dragging, setDragging] = useState<string | null>(null);

  const multi = Object.entries(producers)
    .filter(([symbol, list]) => symbol !== '' && list.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  const pathsFor = (symbol: string) => {
    const declared = state.layout.typingPaths?.[symbol];
    if (declared && declared.length > 0) return declared;
    return (producers[symbol] ?? []).map((p) => ({ producer: p.id, enabled: true }));
  };

  /** Send the whole list back, with one entry moved from `from` to `to`. */
  const reorder = (symbol: string, from: number, to: number) => {
    const entries = [...pathsFor(symbol)];
    if (from === to || to < 0 || to >= entries.length) return;
    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);
    send({ type: 'edit', edit: { kind: 'setTypingPath', symbol, entries } });
  };

  const toggle = (symbol: string, producer: string) => {
    const entries = pathsFor(symbol).map((e) =>
      e.producer === producer ? { ...e, enabled: !(e.enabled ?? true) } : e,
    );
    send({ type: 'edit', edit: { kind: 'setTypingPath', symbol, entries } });
  };

  const rules = rulesOf(state.layout);
  const shiftOffered = shiftWaysOffered(state.layout);
  // The repeat producers are the ones of the symbol ``; until they are read, every way is offered.
  const repeatOffered = Object.keys(producers).length === 0 || (producers['']?.length ?? 0) > 0;
  const rows = (
    list: readonly { way: string; enabled?: boolean }[],
    labels: Record<string, string>,
    offered: (way: string) => boolean,
  ): PathRow[] => {
    const on = list.filter((e) => e.enabled !== false).length;
    return list.map((e) => ({
      id: e.way,
      label: labels[e.way],
      enabled: e.enabled !== false,
      unavailable: !offered(e.way),
      note: offered(e.way) ? undefined : 'no key does this',
      locked: on === 1 && e.enabled !== false,
    }));
  };
  const shiftRows = rows(rules.shift, SHIFT_LABELS, (w) => shiftOffered.includes(w as ShiftWay));
  const doubledRows = rows(
    rules.doubledLetters,
    DOUBLED_LABELS,
    (w) => w !== 'repeatKey' || repeatOffered,
  );

  /** Send the whole rule back, with a way turned on or off, or one moved from `from` to `to`. */
  const setRule = <R extends 'shift' | 'doubledLetters'>(
    rule: R,
    list: readonly { way: string; enabled?: boolean }[],
    change: (entries: { way: string; enabled?: boolean }[]) => void,
  ) => {
    const entries = list.map((e) => ({ way: e.way, enabled: e.enabled !== false }));
    change(entries);
    send({ type: 'edit', edit: { kind: 'setTypingRule', rule, entries } as Edit });
  };
  const moveWay =
    (rule: 'shift' | 'doubledLetters', list: readonly { way: string }[]) =>
    (from: number, to: number) => {
      if (from === to || to < 0 || to >= list.length) return;
      setRule(rule, list, (entries) => {
        const [moved] = entries.splice(from, 1);
        entries.splice(to, 0, moved);
      });
    };
  const toggleWay =
    (rule: 'shift' | 'doubledLetters', list: readonly { way: string }[]) => (way: string) =>
      setRule(rule, list, (entries) => {
        const e = entries.find((x) => x.way === way);
        if (e) e.enabled = !e.enabled;
      });

  return (
    <div className="space-y-2 min-w-0">
      <Carousel label="Typing paths">
        <Slide className="lb-path-slide">
          <Keycap as="h3" symbol="⇧" />
          <div className="lb-path-body">
            <span className="lb-slide-title">Shift kind</span>
            <PathList
              scope="shift"
              label="Shift kind"
              rows={shiftRows}
              dragging={dragging}
              setDragging={setDragging}
              onToggle={toggleWay('shift', rules.shift)}
              onMove={moveWay('shift', rules.shift)}
            />
            <span className="lb-path-hint">
              {shiftOffered.length === 0
                ? 'No key taps or holds Shift. A key that does makes this work.'
                : 'How a capital is typed: Shift tapped once before the letter, or held while it goes down.'}
            </span>
          </div>
        </Slide>
        <Slide className="lb-path-slide">
          <Keycap as="h3" symbol="aa" />
          <div className="lb-path-body">
            <span className="lb-slide-title">Doubled letters</span>
            <PathList
              scope="doubledLetters"
              label="Doubled letters"
              rows={doubledRows}
              dragging={dragging}
              setDragging={setDragging}
              onToggle={toggleWay('doubledLetters', rules.doubledLetters)}
              onMove={moveWay('doubledLetters', rules.doubledLetters)}
            />
            <span className="lb-path-hint">
              A letter twice in a row. Left alone, the cheaper way; set an order, and the first that
              works.
            </span>
          </div>
        </Slide>
        {multi.length === 0 && (
          <Slide className="lb-slide-wide text-xs">Every symbol has a single producer.</Slide>
        )}
        {multi.map(([symbol]) => (
          <Slide key={symbol} className="lb-path-slide">
            <Keycap as="h3" symbol={symbol === ' ' ? '␣' : symbol} />
            <PathList
              scope={symbol}
              rows={pathsFor(symbol).map((entry) => {
                const meta = producers[symbol]?.find((p) => p.id === entry.producer);
                const presses = meta ? `${meta.cost} ${meta.cost === 1 ? 'press' : 'presses'}` : '';
                return {
                  id: entry.producer,
                  label: entry.producer,
                  enabled: entry.enabled ?? true,
                  note: presses || undefined,
                  mono: true,
                  title: meta ? `${meta.kind} · ${entry.producer} · ${presses}` : entry.producer,
                };
              })}
              dragging={dragging}
              setDragging={setDragging}
              onToggle={(producer) => toggle(symbol, producer)}
              onMove={(from, to) => reorder(symbol, from, to)}
            />
          </Slide>
        ))}
      </Carousel>
      <CarouselHint>
        Left alone, a character is typed the cheapest way: the fewest presses, then the fewest
        same-finger pairs with the keys before it, then the least effort. Drag an alternative or use
        the arrows to set an order, and that order is tried instead.
      </CarouselHint>
    </div>
  );
}

/**
 * The layout as a keymap-drawer file, to draw it with keymap-drawer or to bring it back later. It
 * is a drawing: what a legend cannot say, such as an adaptive key's branches, is drawn and not
 * written.
 */
function keymapDrawerYaml(layout: EditState['layout'], compiled: EditState['compiled']): string {
  // The keys that reach each layer, which the file marks `held` there as keymap-drawer does. A
  // key on the layer itself that turns it on again is pressed there, not held to get there.
  const reach = compiled.layers.map(
    (l) =>
      new Set(
        reachKeys(compiled, l.idx)
          .filter((k) => k.routes.some((r) => r.via !== l.idx))
          .map((k) => compiled.keys[k.pos].id),
      ),
  );
  return exportKeymapDrawer(
    layout,
    { keys: compiled.keys, family: compiled.geometry.family },
    (li, id) => compiled.layers[li]?.bindings[compiled.keyIndex.get(id) ?? -1],
    (li, id) => reach[li]?.has(id) ?? false,
  );
}

/**
 * Export: the document itself, for reading and for pasting one in — or as keymap-drawer draws it.
 * The controls are one card, the format choice over two buttons that keep their places in either
 * format, and the text a wide card beside it that scrolls inside itself.
 */
export function ExportPanel({ state, send }: PanelProps) {
  const [format, setFormat] = useState<'json' | 'yaml'>('json');
  const { compiled, layout } = state;
  const text = state.jsonText || JSON.stringify(toCanonicalJson(layout), null, 2);
  const yaml = useMemo(
    () => (format === 'yaml' ? keymapDrawerYaml(layout, compiled) : ''),
    [format, layout, compiled],
  );
  const download = () => {
    const url = URL.createObjectURL(new Blob([yaml], { type: 'application/yaml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(layout.name) || 'layout'}.keymap.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = () =>
    navigator.clipboard
      ?.writeText(yaml)
      .then(() => toast.info('Copied the keymap-drawer YAML'))
      .catch(() => toast.error('The browser would not copy; select the text instead'));
  return (
    // No form: Enter on a format choice would otherwise load the text into the editor.
    <div className="space-y-2 min-w-0">
      <Carousel label="Export">
        <Slide className="lb-export-controls">
          <Segment
            label="Format"
            size="sm"
            fill
            options={[
              ['json', 'LayerBench JSON'],
              ['yaml', 'keymap-drawer YAML'],
            ]}
            value={format}
            onChange={setFormat}
          />
          {/* The same two places in both formats, the primary action on the right. */}
          <fieldset
            aria-label={format === 'yaml' ? 'Export the file' : 'The text'}
            className="lb-export-actions"
          >
            {format === 'yaml' ? (
              <>
                <button type="button" className="btn btn-sm btn-outline" onClick={download}>
                  Download .yaml
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={copy}>
                  Copy
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => send({ type: 'jsonChange', text: '' })}
                >
                  Refresh from editor
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    send({ type: 'edit', edit: { kind: 'replaceLayout', json: text } })
                  }
                >
                  Load into editor
                </button>
              </>
            )}
          </fieldset>
          {/* Two lines at most, the rest in the title: the slide never scrolls for an error. */}
          {format === 'json' && state.jsonError && (
            <p
              className="lb-export-message line-clamp-2 text-error text-xs"
              title={state.jsonError}
            >
              {state.jsonError}
            </p>
          )}
        </Slide>
        <Slide className="lb-export-slide">
          {format === 'yaml' ? (
            <textarea
              wrap="off"
              aria-label="keymap-drawer YAML"
              readOnly
              className="textarea textarea-bordered lb-export-text font-mono text-xs"
              value={yaml}
            />
          ) : (
            <textarea
              wrap="off"
              aria-label="Layout JSON"
              className="textarea textarea-bordered lb-export-text font-mono text-xs"
              value={text}
              onChange={(e) => send({ type: 'jsonChange', text: e.target.value })}
            />
          )}
        </Slide>
      </Carousel>
      <CarouselHint>
        {format === 'yaml' ? (
          <>
            Draw it with <span className="font-mono">keymap draw</span>. Keys whose legends cannot
            say everything they do come back from this file simpler: an adaptive key as a plain key
            typing its default, a macro as the text it types, without its other steps.
          </>
        ) : (
          'The whole layout, as LayerBench JSON to read or to paste one in, or as a keymap-drawer file.'
        )}
      </CarouselHint>
    </div>
  );
}
