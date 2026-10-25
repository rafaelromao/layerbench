import { z } from 'zod';
import type { JsonObject } from '../storage/ids.js';
import { tellIssues } from './issues.js';
import { canonicalLanguages } from './languages.js';
import { LAYER_COLORS, type Layout, MAX_CONDITION_LAYERS } from './types.js';

const ModSchema = z.enum(['LSHIFT', 'RSHIFT', 'LCTRL', 'RCTRL', 'LALT', 'RALT', 'LGUI', 'RGUI']);

const FingerSchema = z.enum(['LP', 'LR', 'LM', 'LI', 'LT', 'RT', 'RI', 'RM', 'RR', 'RP']);

/** An adaptive branch: matched on the previous press's symbol, its binding's tag, or both. */
const TriggerSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      afterAny: z.array(z.string()).optional(),
      afterTags: z.array(z.string()).optional(),
      binding: BindingSchema,
    })
    .refine((t) => t.afterAny !== undefined || t.afterTags !== undefined, {
      message: 'a trigger needs afterAny, afterTags, or both',
    }),
);

/** Why a layer morph that says when it comes on was refused, when that is not `any`. */
export const LAYER_MORPH_MATCH =
  'a layer morph changes while any of its layers is on, as zmk-layer-morph does: match can only be "any"';

/**
 * `schema`, telling only the first thing wrong with what it reads, however much more is. zod copies
 * each fault again at every binding around it, so a deep document of many faults would otherwise
 * cost gigabytes. It runs on what already failed too, the only time there is anything to drop, but
 * not past a transform, a pipe or a refine with `abort` in `schema`, which zod stops at: no
 * binding's `kind` has one.
 */
const firstFaultOnly = <T extends z.ZodType>(schema: T) =>
  schema.superRefine(
    (_, ctx) => {
      ctx.issues.splice(1);
    },
    { when: () => true },
  );

/**
 * What a binding of no kind the schema has is told: its kind, briefly, rather than every kind there
 * is. Any other fault is told as zod tells it.
 */
function unknownKind(issue: { code?: string; input?: unknown }): string | undefined {
  if (issue.code !== 'invalid_union') return undefined;
  const kind = isObject(issue.input) ? issue.input.kind : undefined;
  return kind === undefined ? 'A key needs a kind' : `No key is of kind ${JSON.stringify(kind)}`;
}

/**
 * A binding, read by its `kind`: a plain union would try every kind on a binding that has none of
 * them and keep what each said, which a document of many such bindings could make cost gigabytes.
 * A binding that is wrong tells only its first fault, however many its parts have.
 */
export const BindingSchema: z.ZodType<unknown> = z.lazy(() =>
  firstFaultOnly(
    z.discriminatedUnion(
      'kind',
      [
        z.object({
          kind: z.literal('kp'),
          symbol: z.string().optional(),
          keycode: z.string().optional(),
          shifted: z.string().optional(),
          tag: z.string().optional(),
        }),
        z.object({ kind: z.literal('trans') }),
        z.object({ kind: z.literal('none') }),
        z.object({ kind: z.literal('mo'), layer: z.string() }),
        z.object({ kind: z.literal('lt'), layer: z.string(), tap: BindingSchema }),
        z.object({
          kind: z.literal('sl'),
          layer: z.string(),
          quickRelease: z.boolean().optional(),
          ignoreModifiers: z.boolean().optional(),
          releaseAfterMs: z.number().optional(),
        }),
        z.object({
          kind: z.literal('tog'),
          layer: z.string(),
          mode: z.enum(['flip', 'on', 'off']).default('flip'),
        }),
        z.object({ kind: z.literal('to'), layer: z.string() }),
        z.object({
          kind: z.literal('sk'),
          mod: ModSchema.catch('LSHIFT').default('LSHIFT'),
          quickRelease: z.boolean().optional(),
          ignoreModifiers: z.boolean().optional(),
          releaseAfterMs: z.number().optional(),
        }),
        z.object({
          kind: z.literal('mod'),
          mod: ModSchema.catch('LSHIFT').default('LSHIFT'),
          also: z.array(ModSchema).optional(),
        }),
        z.object({
          kind: z.literal('caps_word'),
          // Defaults live in the machine, not here: the document keeps exactly what it declared.
          continueList: z.array(z.string()).optional(),
          mods: z.array(ModSchema).optional(),
        }),
        z.object({
          kind: z.literal('auto_layer'),
          layer: z.string(),
          continueList: z.array(z.string()).optional(),
        }),
        z.object({ kind: z.literal('key_repeat') }),
        z.object({
          kind: z.literal('mod_morph'),
          mods: z.array(ModSchema).default(['LSHIFT']),
          default: BindingSchema,
          morphed: BindingSchema,
          keepMods: z.array(ModSchema).optional(),
        }),
        z.object({
          kind: z.literal('layer_morph'),
          layers: z.array(z.string()).default([]),
          // The writer once put `any` on every layer morph. It is what every morph does, so it is
          // still read, and written no more. zmk-layer-morph has no other, so nothing else is read.
          match: z.literal('any', { error: LAYER_MORPH_MATCH }).optional(),
          active: BindingSchema,
          inactive: BindingSchema,
        }),
        z.object({
          kind: z.literal('sentence_morph'),
          default: BindingSchema,
          pending: BindingSchema,
        }),
        z.object({ kind: z.literal('sentence_space') }),
        z.object({ kind: z.literal('tap_dance'), bindings: z.array(BindingSchema) }),
        z.object({
          kind: z.literal('macro'),
          steps: z.array(BindingSchema).optional(),
          symbols: z.string().optional(),
          then: z.array(BindingSchema).optional(),
          tag: z.string().optional(),
        }),
        z.object({
          kind: z.literal('adaptive'),
          default: BindingSchema.optional(),
          triggers: z.array(TriggerSchema).optional(),
          strictModifiers: z.boolean().optional(),
          deadKeys: z.array(z.string()).optional(),
        }),
        z.object({
          kind: z.literal('hold_tap'),
          tap: BindingSchema,
          hold: BindingSchema,
          flavor: z.string().optional(),
          tappingTermMs: z.number().optional(),
        }),
        z.object({
          kind: z.literal('dead_key'),
          diacritic: z.string().default('\u00b4'),
          shifted: z.string().optional(),
        }),
        z.object({
          kind: z.literal('unicode'),
          symbol: z.string().default(''),
          shiftedSymbol: z.string().optional(),
        }),
      ],
      { error: unknownKind },
    ),
  ),
);

const GeometryKeySchema = z
  .object({
    id: z.string(),
    hand: z.enum(['L', 'R']),
    finger: FingerSchema,
    row: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    col: z.number().int().min(0).max(5),
    x: z.number(),
    y: z.number(),
    w: z.number().default(1),
    h: z.number().default(1),
    rotation: z.number().default(0),
    home: z.boolean().optional(),
    thumb: z.boolean().optional(),
    inner: z.boolean().optional(),
  })
  // Flags default from the key's position, as the reference parser derives them.
  .transform((k) => ({
    ...k,
    home: k.home ?? k.row === 1,
    thumb: k.thumb ?? k.row === 3,
    inner: k.inner ?? k.col === 5,
  }));

/** Declarative special features; the compiler wraps the keys they belong to. */
const FeaturesSchema = z.object({
  // A document from before sentence case was zmk-sentence-case's may name the punctuation that
  // ends a sentence (`after`) and the modifier it arms (`mod`): the module has its own, so they are
  // read and left out, as any field the schema does not name is.
  sentenceCase: z
    .object({
      enabled: z.boolean().optional(),
      key: z.string().optional(),
      on: z.array(z.string()).optional(),
    })
    .optional(),
  capsWord: z
    .object({
      enabled: z.boolean().optional(),
      key: z.string().optional(),
      on: z.array(z.string()).optional(),
      triggerMods: z.array(ModSchema).optional(),
      mods: z.array(ModSchema).optional(),
      continueList: z.array(z.string()).optional(),
    })
    .optional(),
});

/** Why a layout's link will not do, when `isLayoutLink` says so. */
export const NOT_A_LINK = 'a link is one http:// or https:// URL';

/** Whether `text` will do as a layout's link: one http or https URL, nothing around it. */
export function isLayoutLink(text: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(text)) return false;
  try {
    return Boolean(new URL(text).host);
  } catch {
    return false;
  }
}

export const LayoutSchema = z.object({
  format: z.literal('layerbench/layout@1'),
  id: z.string().optional(),
  name: z.string(),
  author: z.string().optional(),
  description: z.string().optional(),
  link: z.string().refine(isLayoutLink, NOT_A_LINK).optional(),
  languages: z.array(z.string()).optional(),
  hostLocale: z.enum(['symbols', 'us', 'us-intl', 'abnt2']).optional(),
  geometry: z.union([
    z.object({ preset: z.string(), columnOffsets: z.record(z.string(), z.number()).optional() }),
    z.object({
      custom: z.array(GeometryKeySchema),
      family: z.enum(['columnar', 'rowstagger']).optional(),
      name: z.string().optional(),
    }),
  ]),
  fingering: z
    .union([z.enum(['standard', 'angle-mod']), z.record(z.string(), FingerSchema)])
    .optional(),
  keys: z.object({
    space: z.string(),
    // The canonical document writes `null` when the layout declares no shift key.
    shift: z
      .object({ key: z.string(), kind: z.enum(['sk', 'hold']) })
      .nullable()
      .optional()
      .transform((v) => v ?? undefined),
  }),
  behaviorDefaults: z
    .object({
      sl: z
        .object({
          quickRelease: z.boolean().optional(),
          ignoreModifiers: z.boolean().optional(),
          releaseAfterMs: z.number().optional(),
        })
        .optional(),
      sk: z
        .object({
          quickRelease: z.boolean().optional(),
          ignoreModifiers: z.boolean().optional(),
          releaseAfterMs: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  layers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        color: z.enum(LAYER_COLORS).optional(),
        bindings: z.record(z.string(), BindingSchema),
      }),
    )
    .min(1),
  features: FeaturesSchema.optional(),
  combos: z
    .array(
      z.object({
        id: z.string().optional(),
        keys: z.array(z.string()).min(2),
        binding: BindingSchema,
        layers: z.array(z.string()).optional(),
        role: z.enum(['typing', 'command']).optional(),
        timeoutMs: z.number().optional(),
        slowRelease: z.boolean().optional(),
      }),
    )
    // Combos are addressed by id everywhere downstream; give unnamed ones their index-based id.
    .transform((list) => list.map((c, i) => ({ ...c, id: c.id ?? `combo${i}` })))
    .optional(),
  conditionalLayers: z
    .array(z.object({ if: z.array(z.string()).min(1).max(MAX_CONDITION_LAYERS), then: z.string() }))
    // Each waits for layers that come on by keys, so the analysis can try every order of them.
    .refine(
      (list) => {
        const conditional = new Set(list.map((c) => c.then));
        return list.every((c) => !c.if.some((id) => conditional.has(id)));
      },
      { message: 'A conditional layer cannot wait for another conditional layer' },
    )
    // One condition per layer, so what brings it on has one answer.
    .refine((list) => new Set(list.map((c) => c.then)).size === list.length, {
      message: 'A layer comes on by one condition at most',
    })
    .optional(),
  typingPaths: z
    .record(
      z.string(),
      z.array(
        z.object({
          producer: z.string(),
          enabled: z.boolean().optional(),
          when: z.object({ afterAny: z.array(z.string()).optional() }).optional(),
        }),
      ),
    )
    .optional(),
  repeatPolicy: z
    .object({ doubledLetters: z.enum(['repeatKey', 'tapTwice']).optional() })
    .optional(),
  activators: z
    .record(
      z.string(),
      z.array(
        z.object({
          from: z.string().optional(),
          via: z.string(),
          requires: z.object({ mods: z.array(ModSchema).optional() }).optional(),
        }),
      ),
    )
    .optional(),
});

const isObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The fields of a binding that hold one binding, and those that hold a list of them. */
const ONE_BINDING = ['tap', 'hold', 'default', 'morphed', 'active', 'inactive', 'pending'];
const BINDING_LISTS = ['bindings', 'steps', 'then'];

/**
 * How deep the compiler read a key, counting every name it followed and every binding inside
 * another, before it gave up. Only what lies below a name is cut there: a document that names
 * nothing is read whole, however deep it nests, as far as JavaScript has stack for (`TOO_DEEP`).
 */
const MAX_NAMED_DEPTH = 16;

/**
 * How much a document's names may write out below them, all its keys and combos together, weighed
 * as `weightOf` weighs a binding. A keymap's names weigh a few thousand; only names read round a
 * loop, or made to be heavy, come near it.
 */
const MAX_NAMED_WEIGHT = 200_000;

/**
 * About what copying a value costs: one, the length of a text as a document writes it, escapes and
 * all, or for a binding held in it what the least it can be written as weighs, Nothing (`kind`,
 * `none`).
 */
const valueWeight = (v: unknown) =>
  typeof v === 'string' ? JSON.stringify(v).length - 1 : isObject(v) ? 10 : 1;

/** About what copying a field's value costs: a value, or a list and the values in it. */
const fieldWeight = (v: unknown) =>
  Array.isArray(v) ? v.reduce((n: number, x) => n + valueWeight(x), 1) : valueWeight(v);

/**
 * About what writing a binding out once copies: its fields and the text and list items in them, and
 * a branch's own fields. A binding it holds counts as Nothing, and is weighed again when it is
 * written out; anything deeper is nothing the schema reads.
 */
function weightOf(b: JsonObject): number {
  let n = 0;
  for (const [k, v] of Object.entries(b)) {
    n += valueWeight(k) + fieldWeight(v);
    if (k !== 'triggers' || !Array.isArray(v)) continue;
    for (const t of v) {
      if (isObject(t))
        for (const [tk, tv] of Object.entries(t)) n += valueWeight(tk) + fieldWeight(tv);
    }
  }
  return n;
}

/**
 * A document saved while layouts could name bindings of their own (`behaviors`), with each name
 * written out where it was used, as the compiler read it, and the names dropped. A `ref` key is the
 * binding it names. A macro or adaptive key that names one is that binding with its own fields over
 * it; a name the named binding itself builds on was left unread, and still is. One thing reads
 * otherwise: the compiler put sentence case or caps word around a named tap-hold, layer-tap or
 * morph on their key whole, and now they go on its tap, as on any other key. What the compiler
 * could not read made the layout fail to compile: a name the document does not have, a macro or
 * adaptive key built on a binding of another kind, or names read more than 16 bindings deep, as
 * round a loop. Such a key that is only a name becomes Nothing, one built on a name keeps its own
 * fields, and what a name holds deeper than 16 bindings is Nothing. So is a binding below a name
 * that would take what is written out past `MAX_NAMED_WEIGHT`: the compiler read one key at a time,
 * but a document is read whole, and a name used round a loop, or made heavy, must not hang it. A
 * document that names nothing reads as it is.
 */
function withNamedBindingsInline(input: unknown): unknown {
  if (!isObject(input)) return input;
  const { behaviors, ...document } = input;
  const named = isObject(behaviors) ? behaviors : {};
  const lookUp = (name: unknown) =>
    typeof name === 'string' && Object.hasOwn(named, name) ? named[name] : undefined;
  let left = MAX_NAMED_WEIGHT;
  const weights = new WeakMap<JsonObject, number>();
  const weigh = (b: JsonObject) => {
    const known = weights.get(b);
    if (known !== undefined) return known;
    const w = weightOf(b);
    weights.set(b, w);
    return w;
  };
  /** `depth`: as the compiler counted it on the way to `b`; `belowName`: a name was followed. */
  const inline = (b: unknown, depth: number, belowName: boolean): unknown => {
    if (!isObject(b)) return b;
    if (belowName && depth > MAX_NAMED_DEPTH) return { kind: 'none' };
    if (b.kind === 'ref') {
      const target = lookUp(b.ref);
      return target === undefined ? { kind: 'none' } : inline(target, depth + 1, true);
    }
    const building = (b.kind === 'macro' || b.kind === 'adaptive') && 'ref' in b;
    // An empty name named nothing.
    const target = building && b.ref ? lookUp(b.ref) : undefined;
    const builds = isObject(target) && target.kind === b.kind;
    const inside = belowName || builds;
    // Below a name, what a binding copies is weighed before any of it is, so neither a loop nor a
    // heavy name writes out more than the most.
    if (inside) {
      const weight = weigh(b) + (builds ? weigh(target) : 0);
      if (weight > left) return { kind: 'none' };
      left -= weight;
    }
    let own = b;
    if (building) {
      const { ref: _ref, ...rest } = b;
      const { ref: _unread, ...built } = builds ? { ...target, ...rest } : rest;
      own = built;
    }
    const out: JsonObject = { ...own };
    for (const k of ONE_BINDING) if (isObject(own[k])) out[k] = inline(own[k], depth + 1, inside);
    for (const k of BINDING_LISTS) {
      const list = own[k];
      if (Array.isArray(list)) out[k] = list.map((x) => inline(x, depth + 1, inside));
    }
    if (Array.isArray(own.triggers)) {
      out.triggers = own.triggers.map((t) =>
        isObject(t) ? { ...t, binding: inline(t.binding, depth + 1, inside) } : t,
      );
    }
    return out;
  };
  const { layers, combos } = document;
  return {
    ...document,
    ...(Array.isArray(layers) && {
      layers: layers.map((l) =>
        isObject(l) && isObject(l.bindings)
          ? {
              ...l,
              bindings: Object.fromEntries(
                Object.entries(l.bindings).map(([k, b]) => [k, inline(b, 0, false)]),
              ),
            }
          : l,
      ),
    }),
    ...(Array.isArray(combos) && {
      combos: combos.map((c) => (isObject(c) ? { ...c, binding: inline(c.binding, 0, false) } : c)),
    }),
  };
}

const NOTHING = { kind: 'none' };
const TRANSPARENT = { kind: 'trans' };
const imported = (b: unknown) => isObject(b) && b.kind === 'raw';

/**
 * `b` with no imported key in it (`raw`, which the format had until PR #79), made as #79 made the
 * bundled layouts and imports: one alone is transparent, as a key left unset; one tapped under a
 * hold taps nothing, and the hold stays; and a hold imported drops, leaving the key its tap, or
 * transparent if that taps nothing. In a macro it is a step that does nothing, and goes.
 */
function withoutImported(b: unknown): unknown {
  if (!isObject(b)) return b;
  if (imported(b)) return TRANSPARENT;
  if (b.kind === 'hold_tap' && imported(b.hold)) {
    const tap = withoutImported(b.tap);
    return isObject(tap) && tap.kind !== 'none' ? tap : TRANSPARENT;
  }
  const out: JsonObject = { ...b };
  if ((b.kind === 'hold_tap' || b.kind === 'lt') && imported(b.tap)) out.tap = NOTHING;
  for (const k of ONE_BINDING) if (isObject(out[k])) out[k] = withoutImported(out[k]);
  for (const k of BINDING_LISTS) {
    const list = out[k];
    if (!Array.isArray(list)) continue;
    const kept = b.kind === 'macro' ? list.filter((x) => !imported(x)) : list;
    out[k] = kept.map(withoutImported);
  }
  if (Array.isArray(out.triggers)) {
    out.triggers = out.triggers.map((t) =>
      isObject(t) ? { ...t, binding: withoutImported(t.binding) } : t,
    );
  }
  return out;
}

/**
 * A document saved while the format had imported keys (`raw`), read without them
 * (`withoutImported`), so a layout saved before PR #79 still opens, and saves without them. A combo
 * left transparent goes, as the editor makes none. Every other fault is the schema's to tell.
 */
function withoutImportedKeys(input: unknown): unknown {
  if (!isObject(input)) return input;
  const { layers, combos } = input;
  let dropped = false;
  return {
    ...input,
    ...(Array.isArray(layers) && {
      layers: layers.map((l) =>
        isObject(l) && isObject(l.bindings)
          ? {
              ...l,
              bindings: Object.fromEntries(
                Object.entries(l.bindings).map(([k, b]) => [k, withoutImported(b)]),
              ),
            }
          : l,
      ),
    }),
    ...(Array.isArray(combos) && {
      combos: combos.flatMap((c, i) => {
        if (!isObject(c)) return [c];
        const binding = withoutImported(c.binding);
        // Only a combo the conversion left transparent: one already so is the schema's to read.
        const left =
          isObject(c.binding) &&
          c.binding.kind !== 'trans' &&
          isObject(binding) &&
          binding.kind === 'trans';
        if (left) {
          dropped = true;
          return [];
        }
        // One unnamed keeps the id its place gave it, though a combo before it went.
        return [dropped ? { id: `combo${i}`, ...c, binding } : { ...c, binding }];
      }),
    }),
  };
}

/**
 * How many values a document may hold: itself, and each object, list, text, number, flag and null
 * in it as JSON writes it, so a field that holds nothing is none; as it is given, and with its
 * names written out. The largest bundled layout holds about 1,100, and a keymap of 32 layers of
 * hold-taps on 60 keys about 15,000. It bounds what is read, not the document a layout is written
 * as (`toCanonicalJson`), which adds the defaults its document left out: up to about 1.75 times as
 * many values, so a layout read near the most can be written past it. zod makes an issue for each
 * value it finds wrong or missing, and builds them all before any can be left out, so a document
 * wrong in a million places, as a link of a few kilobytes can be, would take a gigabyte to refuse.
 * One of 50,000 values, all wrong, takes a few hundred megabytes at most.
 */
const MAX_VALUES = 50_000;

/** Why a document was refused that holds more than `MAX_VALUES` values. */
const TOO_MANY = `The document holds more than ${MAX_VALUES.toLocaleString('en-US')} values, too many to be read`;

/**
 * Whether `doc` holds more than `most` values, counted as `MAX_VALUES` counts them, and only as far
 * as the most: neither a long list nor a deep one costs more than that to count.
 */
function holdsMoreThan(doc: unknown, most: number): boolean {
  let left = most - 1;
  const open = [doc];
  while (open.length > 0) {
    const v = open.pop();
    if (typeof v !== 'object' || v === null) continue;
    if (Array.isArray(v)) {
      for (const x of v) {
        if (--left < 0) return true;
        open.push(x);
      }
    } else {
      for (const k in v) {
        const x = (v as JsonObject)[k];
        if (x === undefined) continue;
        if (--left < 0) return true;
        open.push(x);
      }
    }
  }
  return false;
}

/**
 * `input` as the schema reads it, its names written out, or `undefined` when either holds more than
 * `MAX_VALUES` values. It is counted before its names are written out too, so a document too big to
 * read costs no more to refuse than counting to the most.
 */
function toRead(input: unknown): { doc: unknown } | undefined {
  if (holdsMoreThan(input, MAX_VALUES)) return undefined;
  const doc = withoutImportedKeys(withNamedBindingsInline(input));
  return holdsMoreThan(doc, MAX_VALUES) ? undefined : { doc };
}

/** Read a layout document. */
export function parseLayout(input: unknown): Layout {
  const read = toRead(input);
  if (!read) throw new Error(TOO_MANY);
  const layout = LayoutSchema.parse(read.doc) as Layout;
  return { ...layout, languages: canonicalLanguages(layout.languages) };
}

/** Why a document was refused that JavaScript ran out of stack reading. */
const TOO_DEEP = 'The document nests too deep, or is wrong in too many places, to be read';

/** Read a layout document, or say why it cannot be read. */
export function safeParseLayout(
  input: unknown,
): { ok: true; layout: Layout } | { ok: false; error: string } {
  let r: ReturnType<typeof LayoutSchema.safeParse>;
  try {
    const read = toRead(input);
    if (!read) return { ok: false, error: TOO_MANY };
    r = LayoutSchema.safeParse(read.doc);
  } catch (e) {
    // Writing names out, and zod, read a binding inside another by calling themselves, and zod
    // gathers what is wrong by spreading it into a call, so a document nested deep enough, or wrong
    // in enough places, runs out of stack: a RangeError, or in Firefox an InternalError.
    // If zod is what ran out, it keeps what it had begun to read (`open` in its memoizer) while the
    // page lives.
    if (e instanceof RangeError || (e instanceof Error && e.name === 'InternalError')) {
      return { ok: false, error: TOO_DEEP };
    }
    throw e;
  }
  return r.success
    ? { ok: true, layout: { ...r.data, languages: canonicalLanguages(r.data.languages) } as Layout }
    : { ok: false, error: tellIssues(r.error.issues) };
}

export function layoutJsonSchema(): unknown {
  return z.toJSONSchema(LayoutSchema, { target: 'draft-2020-12', unrepresentable: 'any' });
}
