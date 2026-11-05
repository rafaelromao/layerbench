import {
  addableKeys,
  type Binding,
  boardKeys,
  type Edit,
  exportKeymapDrawer,
  featureModule,
  freeCondition,
  GEOMETRY_PRESET_IDS,
  geometryWithKeys,
  keysInUse,
  LAYER_COLORS,
  type LayerColor,
  type LayoutFeatures,
  layerReachedFrom,
  legend,
  reachKeys,
  type SpecialFeature,
  type SpecialFeatureKind,
  slug,
  specialFeatures,
  toCanonicalJson,
  type ZmkModuleId,
} from '@layerbench/core';
import {
  type CSSProperties,
  type Dispatch,
  type ReactNode,
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
import { LayerChips, ModuleNote, Segment, TextField } from './inspector/controls.js';
import { type EditAction, type EditState, shownLayer } from './reducer.js';

type Send = Dispatch<EditAction>;

interface PanelProps {
  state: EditState;
  send: Send;
}

function FeatureRow({
  title,
  hint,
  module,
  on,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  /** The ZMK module the feature needs, said whether it is on or off. */
  module?: ZmkModuleId | null;
  on: boolean;
  onToggle: (next: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <Slide
      className="lb-slide-wide lb-slide-accent lb-feature-slide"
      style={on ? ({ '--lb-accent': 'var(--color-primary)' } as CSSProperties) : undefined}
    >
      <label className="lb-feature-head">
        <span className="lb-slide-title">{title}</span>
        <input
          type="checkbox"
          aria-label={title}
          className="toggle toggle-sm toggle-primary"
          checked={on}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      <p className="lb-feature-hint">{hint}</p>
      {module ? <ModuleNote module={module} /> : null}
      {on && children ? <div>{children}</div> : null}
    </Slide>
  );
}

/**
 * Features: the typing behaviours that go on a key by its role, the space key or the shift key.
 *
 * Each wraps the key it belongs to — the space key, the shift key — in ordinary bindings, so the
 * layer list stays the set of layers a typist actually reaches. Adaptive keys and alt repeats are
 * not here: they are made on their keys, like any other kind of key.
 */
export function FeaturesPanel({ state, send }: PanelProps) {
  const f: LayoutFeatures = state.layout.features ?? {};
  const set = (next: LayoutFeatures) =>
    send({ type: 'edit', edit: { kind: 'setFeatures', features: next } });
  const enabled = (v: { enabled?: boolean } | undefined) => v !== undefined && v.enabled !== false;

  return (
    <div className="space-y-2 min-w-0">
      <Carousel label="Features">
        <FeatureRow
          title="Sentence case"
          hint="After . ? or ! and a space, the next key, if a letter a–z, is a capital."
          module={featureModule('sentenceCase')}
          on={enabled(f.sentenceCase)}
          onToggle={(on) => set({ ...f, sentenceCase: on ? {} : undefined })}
        />

        <FeatureRow
          title="Caps word"
          hint="Capitals until the word ends, from pressing shift while shift is already on."
          on={enabled(f.capsWord)}
          onToggle={(on) => set({ ...f, capsWord: on ? {} : undefined })}
        >
          <label className="form-control">
            <span className="label-text text-xs">Does not end the word</span>
            <input
              aria-label="Caps word continue list"
              className="input input-xs input-bordered w-40 font-mono"
              value={(f.capsWord?.continueList ?? []).join(' ')}
              onChange={(e) =>
                set({
                  ...f,
                  capsWord: {
                    ...f.capsWord,
                    continueList: e.target.value.split(/\s+/).filter(Boolean),
                  },
                })
              }
            />
          </label>
        </FeatureRow>
      </Carousel>
      <CarouselHint>
        Each goes on the key it belongs to, the space key or the shift key, with no layer of its
        own. Adaptive keys and alt repeats are made on the key, with its Adaptive or Alt repeat
        tile.
      </CarouselHint>
    </div>
  );
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
 * The colour a layer is drawn in: Automatic, the one its place in the list gives it, or one of the
 * palette's, each tuned for both themes. The swatch shows the colour the layer has now.
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
  const shown = layerColourOf(index, value);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        aria-hidden="true"
        className="lb-layer-swatch"
        style={shown ? { background: shown } : undefined}
      />
      <select
        aria-label={`Colour of layer ${layerName}`}
        className="select select-xs select-ghost w-auto min-w-0"
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as LayerColor | undefined)}
      >
        <option value="">Automatic</option>
        {LAYER_COLORS.map((c) => (
          <option key={c} value={c}>
            {COLOUR_NAMES[c]}
          </option>
        ))}
      </select>
    </span>
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

/** The most a key unit of the board of the Geometry tab takes, in pixels. */
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
 * Geometry: the preset and the board's keys, which key is space and which shift, how doubled
 * letters are typed, and how the one-shots end, each in a card of its own.
 */
export function GeometryPanel({ state, send }: PanelProps) {
  const { layout, compiled } = state;
  const preset = 'preset' in layout.geometry ? layout.geometry.preset : 'custom';
  return (
    <div className="space-y-2 min-w-0">
      <Carousel label="Geometry">
        <Slide className="lb-slide-wide space-y-1.5">
          <label className="block space-y-1.5">
            <span className="lb-slide-title block">Preset</span>
            <select
              aria-label="Geometry preset"
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

        <Slide className="lb-slide-wide space-y-1.5">
          <span className="lb-slide-title block">Space, shift and doubled letters</span>
          <label className="lb-slide-field">
            <span>Space key</span>
            <select
              aria-label="Space key"
              className="select select-xs select-bordered w-full"
              value={layout.keys.space}
              onChange={(e) =>
                send({ type: 'edit', edit: { kind: 'setKeys', space: e.target.value } })
              }
            >
              {compiled.keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.id}
                </option>
              ))}
            </select>
          </label>
          <label className="lb-slide-field">
            <span>Shift key</span>
            <select
              aria-label="Shift key"
              className="select select-xs select-bordered w-full"
              value={layout.keys.shift?.key ?? ''}
              onChange={(e) =>
                send({ type: 'edit', edit: { kind: 'setKeys', shift: e.target.value || null } })
              }
            >
              <option value="">—</option>
              {compiled.keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.id}
                </option>
              ))}
            </select>
          </label>
          <label className="lb-slide-field">
            <span>Shift kind</span>
            <select
              aria-label="Shift kind"
              className="select select-xs select-bordered w-full"
              value={layout.keys.shift?.kind ?? 'sk'}
              onChange={(e) =>
                send({
                  type: 'edit',
                  edit: { kind: 'setKeys', shiftKind: e.target.value as 'sk' | 'hold' },
                })
              }
            >
              <option value="sk">sticky (one-shot)</option>
              <option value="hold">hold</option>
            </select>
          </label>
          <label className="lb-slide-field">
            <span>Doubled letters</span>
            <select
              aria-label="Doubled letters"
              className="select select-xs select-bordered w-full"
              value={layout.repeatPolicy?.doubledLetters ?? 'repeatKey'}
              onChange={(e) =>
                send({
                  type: 'edit',
                  edit: { kind: 'setKeys', repeat: e.target.value as 'repeatKey' | 'tapTwice' },
                })
              }
            >
              <option value="repeatKey">repeat key</option>
              <option value="tapTwice">tap twice</option>
            </select>
          </label>
        </Slide>

        <OneShotDefaults which="sl" title="One-shot layers" state={state} send={send} />
        <OneShotDefaults which="sk" title="One-shot keys" state={state} send={send} />
      </Carousel>
      <CarouselHint>
        Tap a key to take it away, or a + to add one. A key can go only when it is Transparent or
        None on every layer and nothing else uses it.
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
export function CombosPanel({ state, send }: PanelProps) {
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
                onClick={() => send({ type: 'selectCombo', combo: open ? null : i })}
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

/** Behaviors: the layout's special features. */
export function BehaviorsPanel({
  state,
  send,
  onShow,
}: PanelProps & {
  /** Before a feature is shown on the board: a word playing there would hide it. */
  onShow?: () => void;
}) {
  return <SpecialFeatureList state={state} send={send} onShow={onShow} />;
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
 * The layout's special features, a slide each, kind by kind, on a key that shows what the feature's
 * key or combo types: every use names its layer and key, or its combo, and picking it shows it on
 * the board — the key selected on its layer, or the combo's keys outlined.
 */
function SpecialFeatureList({ state, send, onShow }: PanelProps & { onShow?: () => void }) {
  const features = useMemo(() => specialFeatures(state.layout), [state.layout]);
  const { compiled } = state;
  const show = (f: SpecialFeature) => {
    onShow?.();
    // The board is the first tab: what is shown is on it.
    send({ type: 'setPanel', panel: 'board' });
    // Whatever the board is doing gives way: a pick of a combo's keys would keep its clicks, and an
    // armed swap or an open combo would add their keys to the outline.
    send({ type: 'comboPickCancel' });
    send({ type: 'cancelSwap' });
    if (f.combo !== undefined) {
      send({ type: 'selectCombo', combo: null });
      const combo = f.comboIndex === undefined ? undefined : state.layout.combos?.[f.comboIndex];
      send({ type: 'setBoardHighlight', keys: combo?.keys ?? [] });
      return;
    }
    const layer = f.layer === undefined ? undefined : compiled.layerIndex.get(f.layer);
    if (layer === undefined || f.key === undefined) return;
    send({ type: 'setBoardHighlight', keys: [] });
    send({ type: 'selectLayer', layer });
    send({ type: 'keyClick', keyId: f.key });
  };
  /** What the feature's key, or its combo, types, as the board would draw it. */
  const typedBy = (f: SpecialFeature) => {
    let binding: Binding | undefined;
    if (f.combo !== undefined) {
      binding =
        f.comboIndex === undefined ? undefined : state.layout.combos?.[f.comboIndex]?.binding;
    } else {
      const layer = f.layer === undefined ? undefined : compiled.layerIndex.get(f.layer);
      const key = f.key === undefined ? undefined : compiled.keyIndex.get(f.key);
      binding =
        layer === undefined || key === undefined ? undefined : compiled.layers[layer].bindings[key];
    }
    return binding ? legend(compiled, binding) : null;
  };
  const placeOf = (f: SpecialFeature) => {
    if (f.combo !== undefined) return `Combo ${f.combo}`;
    const layer = f.layer === undefined ? undefined : compiled.layerIndex.get(f.layer);
    return `${layer === undefined ? f.layer : compiled.layers[layer].name} · ${f.key}`;
  };

  return (
    <section className="space-y-2 min-w-0" aria-label="Special features">
      <Carousel label="Special behaviors">
        {features.length === 0 && (
          <Slide className="lb-slide-wide text-xs">This layout has no special features.</Slide>
        )}
        {FEATURE_GROUPS.flatMap(([kind, title, accent]) =>
          features
            .filter((f) => f.feature === kind)
            .map((f, i) => {
              const current =
                f.combo === undefined &&
                state.selected === f.key &&
                compiled.layers[state.layer]?.id === f.layer;
              const typed = typedBy(f);
              return (
                <Slide
                  // biome-ignore lint/suspicious/noArrayIndexKey: one key can hold a feature twice
                  key={`${kind}-${f.layer}-${f.key}-${f.combo}-${f.label}-${i}`}
                  current={current}
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
        )}
      </Carousel>
      <CarouselHint>
        Pick one to see it on the Board: its layer turned up with the key selected, or the combo's
        keys outlined.
      </CarouselHint>
    </section>
  );
}

/**
 * Typing paths: which producer wins when a symbol can be typed more than one way. A slide for each
 * such symbol, drawn on a key at its left, with the ways it can be typed beside it.
 */
export function PathsPanel({
  state,
  send,
  producers,
}: PanelProps & { producers: Record<string, ProducerDTO[]> }) {
  // Which chip is in flight, as `symbol:index`, so a drag cannot cross from one symbol to another.
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

  return (
    <div className="space-y-2 min-w-0">
      <Carousel label="Typing paths">
        {multi.length === 0 && (
          <Slide className="lb-slide-wide text-xs">Every symbol has a single producer.</Slide>
        )}
        {multi.map(([symbol]) => (
          <Slide key={symbol} className="lb-path-slide">
            <Keycap as="h3" symbol={symbol === ' ' ? '␣' : symbol} />
            <ol className="lb-path-list">
              {pathsFor(symbol).map((entry, i, all) => {
                const meta = producers[symbol]?.find((p) => p.id === entry.producer);
                const enabled = entry.enabled ?? true;
                const presses = meta ? `${meta.cost} ${meta.cost === 1 ? 'press' : 'presses'}` : '';
                // The first of those in use is the way the analysis types it.
                const first = enabled && all.findIndex((e) => e.enabled ?? true) === i;
                return (
                  <li
                    key={entry.producer}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(i));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(`${symbol}:${i}`);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => {
                      if (dragging?.startsWith(`${symbol}:`)) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = Number(e.dataTransfer.getData('text/plain'));
                      setDragging(null);
                      if (Number.isInteger(from)) reorder(symbol, from, i);
                    }}
                    className={`lb-path-row ${first ? 'lb-path-first' : ''} ${
                      enabled ? '' : 'opacity-40'
                    } ${dragging === `${symbol}:${i}` ? 'opacity-50' : ''}`}
                  >
                    <span aria-hidden="true" className="opacity-40">
                      ⠿
                    </span>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      aria-label={`Use ${entry.producer}`}
                      checked={enabled}
                      onChange={() => toggle(symbol, entry.producer)}
                    />
                    <span
                      className="font-mono flex-1 min-w-0 truncate"
                      title={
                        meta ? `${meta.kind} · ${entry.producer} · ${presses}` : entry.producer
                      }
                    >
                      {entry.producer}
                    </span>
                    {presses && <span className="lb-path-cost">{presses}</span>}
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square"
                      aria-label={`Move ${entry.producer} up`}
                      disabled={i === 0}
                      onClick={() => reorder(symbol, i, i - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square"
                      aria-label={`Move ${entry.producer} down`}
                      disabled={i === all.length - 1}
                      onClick={() => reorder(symbol, i, i + 1)}
                    >
                      ↓
                    </button>
                  </li>
                );
              })}
            </ol>
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
 * JSON: the document itself, for reading and for pasting one in — or as keymap-drawer draws it.
 * The controls are a card, and the text a wide one beside it that scrolls inside itself.
 */
export function JsonPanel({ state, send }: PanelProps) {
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
  return (
    // No form: Enter on a format choice would otherwise load the text into the editor.
    <div className="space-y-2 min-w-0">
      <Carousel label="JSON">
        <Slide className="lb-json-controls space-y-2">
          <Segment
            label="Format"
            options={[
              ['json', 'LayerBench JSON'],
              ['yaml', 'keymap-drawer YAML'],
            ]}
            value={format}
            onChange={setFormat}
          />
          {format === 'yaml' ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(yaml)
                    .then(() => toast.info('Copied the keymap-drawer YAML'))
                    .catch(() => toast.error('The browser would not copy; select the text instead'))
                }
              >
                Copy
              </button>
              <button type="button" className="btn btn-sm" onClick={download}>
                Download .yaml
              </button>
            </div>
          ) : (
            <>
              {state.jsonError && <p className="text-error text-xs">{state.jsonError}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
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
              </div>
            </>
          )}
        </Slide>
        <Slide className="lb-json-slide">
          {format === 'yaml' ? (
            <textarea
              wrap="off"
              aria-label="keymap-drawer YAML"
              readOnly
              className="textarea textarea-bordered lb-json-text font-mono text-xs"
              value={yaml}
            />
          ) : (
            <textarea
              wrap="off"
              aria-label="Layout JSON"
              className="textarea textarea-bordered lb-json-text font-mono text-xs"
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
