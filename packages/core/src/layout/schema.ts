import { z } from 'zod';
import type { Layout } from './types.js';

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

export const BindingSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
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
    z.object({ kind: z.literal('mod'), mod: ModSchema.catch('LSHIFT').default('LSHIFT') }),
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
      match: z.enum(['any', 'all']).default('any'),
      active: BindingSchema,
      inactive: BindingSchema,
    }),
    z.object({ kind: z.literal('tap_dance'), bindings: z.array(BindingSchema) }),
    z.object({
      kind: z.literal('macro'),
      steps: z.array(BindingSchema).optional(),
      symbols: z.string().optional(),
      then: z.array(BindingSchema).optional(),
      ref: z.string().optional(),
      tag: z.string().optional(),
    }),
    z.object({
      kind: z.literal('adaptive'),
      default: BindingSchema.optional(),
      triggers: z.array(TriggerSchema).optional(),
      strictModifiers: z.boolean().optional(),
      deadKeys: z.array(z.string()).optional(),
      ref: z.string().optional(),
    }),
    z.object({
      kind: z.literal('hold_tap'),
      tap: BindingSchema,
      hold: BindingSchema,
      flavor: z.string().optional(),
      tappingTermMs: z.number().optional(),
    }),
    z.object({ kind: z.literal('dead_key'), diacritic: z.string().default('\u00b4') }),
    z.object({
      kind: z.literal('unicode'),
      symbol: z.string().default(''),
      shiftedSymbol: z.string().optional(),
    }),
    z.object({ kind: z.literal('ref'), ref: z.string() }),
  ]),
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

const PlacementSchema = z.object({ layer: z.string(), key: z.string() });

/** Declarative special features; the compiler desugars them into behaviours and bindings. */
const FeaturesSchema = z.object({
  adaptiveKeys: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        enabled: z.boolean().optional(),
        default: BindingSchema,
        triggers: z.array(TriggerSchema).default([]),
        strictModifiers: z.boolean().optional(),
        deadKeys: z.array(z.string()).optional(),
        at: z.array(PlacementSchema).optional(),
      }),
    )
    .optional(),
  altRepeat: z
    .object({
      enabled: z.boolean().optional(),
      id: z.string().optional(),
      at: z.array(PlacementSchema).optional(),
      triggers: z.array(TriggerSchema).default([]),
      secondStage: z
        .object({
          afterTags: z.array(z.string()).min(1),
          triggers: z.array(TriggerSchema).default([]),
        })
        .optional(),
    })
    .optional(),
  sentenceCase: z
    .object({
      enabled: z.boolean().optional(),
      after: z.array(z.string()).optional(),
      key: z.string().optional(),
      on: z.array(z.string()).optional(),
      mod: ModSchema.optional(),
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

export const LayoutSchema = z.object({
  format: z.literal('layoutmaster/layout@1'),
  id: z.string().optional(),
  name: z.string(),
  author: z.string().optional(),
  description: z.string().optional(),
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
        bindings: z.record(z.string(), BindingSchema),
      }),
    )
    .min(1),
  features: FeaturesSchema.optional(),
  behaviors: z.record(z.string(), BindingSchema).optional(),
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
    .array(z.object({ if: z.array(z.string()).min(1), then: z.string() }))
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

export function parseLayout(input: unknown): Layout {
  return LayoutSchema.parse(input) as Layout;
}

export function safeParseLayout(
  input: unknown,
): { ok: true; layout: Layout } | { ok: false; error: string } {
  const r = LayoutSchema.safeParse(input);
  if (r.success) return { ok: true, layout: r.data as Layout };
  return { ok: false, error: z.prettifyError(r.error) };
}

export function layoutJsonSchema(): unknown {
  return z.toJSONSchema(LayoutSchema, { target: 'draft-2020-12', unrepresentable: 'any' });
}
