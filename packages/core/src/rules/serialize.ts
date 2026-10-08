import { z } from 'zod';
import { layoutsDoc } from './presets.js';
import type { RuleSet } from './types.js';

/**
 * Rule sets are stored as JSON with the same snake_case keys and enum values used in memory, so
 * serialization is validation plus `JSON.parse`, with no key mapping.
 */

const NumSchema = z.union([z.number(), z.string().regex(/^\$global\./)]);

const NumCondSchema: z.ZodType<unknown> = z.union([
  NumSchema,
  z.object({ abs: NumSchema }),
  z.object({ abs_min: NumSchema, abs_max: NumSchema.optional() }),
  z.object({ abs_max: NumSchema }),
  z.object({ eq: NumSchema }),
  z.object({
    min: NumSchema.optional(),
    max: NumSchema.optional(),
    gt: NumSchema.optional(),
    lt: NumSchema.optional(),
  }),
]);

const SetCondSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.object({ in: z.array(z.union([z.string(), z.number()])) }),
]);

const LeafSchema = z
  .object({
    at: z.array(z.number().int()).optional(),
    hand: SetCondSchema.optional(),
    finger: SetCondSchema.optional(),
    includes_finger: SetCondSchema.optional(),
    finger_name: SetCondSchema.optional(),
    includes_finger_name: SetCondSchema.optional(),
    finger_name_pair: z.array(z.string()).optional(),
    row: SetCondSchema.optional(),
    col: SetCondSchema.optional(),
    layer: SetCondSchema.optional(),
    any_layer: SetCondSchema.optional(),
    key_kind: SetCondSchema.optional(),
    any_key_kind: SetCondSchema.optional(),
    is_thumb: z.boolean().optional(),
    any_thumb: z.boolean().optional(),
    is_home: z.boolean().optional(),
    is_inner: z.boolean().optional(),
    any_inner: z.boolean().optional(),
    is_chord: z.boolean().optional(),
    same_hand: z.boolean().optional(),
    same_finger: z.boolean().optional(),
    same_key: z.boolean().optional(),
    adjacent_fingers: z.boolean().optional(),
    rank_delta: NumCondSchema.optional(),
    row_delta: NumCondSchema.optional(),
    col_delta: NumCondSchema.optional(),
    x_distance: NumCondSchema.optional(),
    y_distance: NumCondSchema.optional(),
    distance: NumCondSchema.optional(),
    direction: z.enum(['inward', 'outward', 'same', 'none']).optional(),
    hand_pattern: z.string().optional(),
    monotone: z.boolean().optional(),
    changes_direction: z.boolean().optional(),
    distinct_fingers: z.boolean().optional(),
    finger_height_preference: z.literal('violated').optional(),
  })
  .strict();

const PredicateSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(PredicateSchema) }),
    z.object({ any: z.array(PredicateSchema) }),
    z.object({ none: z.array(PredicateSchema) }),
    LeafSchema,
  ]),
);

const BandsSchema = z.object({
  direction: z.enum(['lower_is_better', 'higher_is_better']).optional(),
  bounds: z.array(z.number()),
  labels: z.array(z.string()).optional(),
});

const RuleSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  family: z.enum(['bigram', 'skipgram', 'trigram', 'usage', 'effort', 'layer', 'other']).optional(),
  enabled: z.boolean().optional(),
  source: z.enum(['ngram', 'run', 'word', 'stat', 'travel']).optional(),
  ngram: z
    .object({
      n: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      skip: z.union([z.number().int(), z.array(z.number().int())]).optional(),
    })
    .optional(),
  where: PredicateSchema.nullable().optional(),
  weight: z
    .object({
      adjacent_fingers: z.number().optional(),
      non_adjacent_fingers: z.number().optional(),
      default: z.number().optional(),
    })
    .nullable()
    .optional(),
  aggregate: z
    .enum([
      'percent_of_ngrams',
      'percent_of_keystrokes',
      'count',
      'per100',
      'sum_distance',
      'mean_distance',
      'per_finger',
      'per_hand',
      'per_layer',
      'per_row',
      'per_col',
      'weighted_sum',
      'ratio',
      'histogram',
      'top_strings',
    ])
    .optional(),
  aggregate_opts: z
    .object({
      numerator: z.string().optional(),
      denominator: z.string().optional(),
      per: z.enum(['symbols', 'keystrokes', 'words']).optional(),
    })
    .optional(),
  breakdown_by: z.enum(['layer', 'row', 'col', 'key_kind', 'hand']).optional(),
  // Effort tables are keyed by key id, so unknown keys are data, not errors.
  params: z
    .object({
      effort: z.record(z.string(), z.number()).optional(),
      finger_height_preference: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  scale: z.number().optional(),
  bands: BandsSchema.nullable().optional(),
  score: z.object({ weight: z.number() }).optional(),
  unit: z.enum(['percent', 'ratio', 'distance', 'length', 'per100', 'effort', 'count']).optional(),
  stat: z.string().optional(),
  travel_mode: z.enum(['continuous', 'reset_at_word']).optional(),
  run: z
    .object({
      by: z.enum(['hand', 'finger', 'layer']).optional(),
      min_len: z.number().int().optional(),
    })
    .optional(),
  min_length: z.number().int().optional(),
  min_count: z.number().int().optional(),
});

const GlobalsSchema = z.object({
  universe: z.enum(['no_space', 'with_space']).optional(),
  cross_word: z.enum(['reset', 'bridge']).optional(),
  skip_weights: z.array(z.number()).optional(),
  distance_model: z.enum(['euclid', 'squared', 'manhattan']).optional(),
  lsb_adjacent_u: z.number().optional(),
  lsb_semi_adjacent_u: z.number().optional(),
  top_items: z.number().int().optional(),
  space_per_word_in_keystrokes: z.boolean().optional(),
});

export const RuleSetSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  globals: GlobalsSchema.default({}),
  rules: z.array(RuleSchema),
  score_enabled: z.boolean().optional(),
});

export function parseRuleSet(value: unknown): RuleSet {
  return RuleSetSchema.parse(value) as unknown as RuleSet;
}

export function safeParseRuleSet(
  value: unknown,
): { ok: true; ruleSet: RuleSet } | { ok: false; error: string } {
  const r = RuleSetSchema.safeParse(value);
  if (r.success) return { ok: true, ruleSet: r.data as unknown as RuleSet };
  return { ok: false, error: z.prettifyError(r.error) };
}

/** Parse rule-set JSON text, filling anything the document omits from the Layouts Doc set. */
export function ruleSetFromJson(
  json: string,
): { ok: true; ruleSet: RuleSet } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'rule set must be an object' };
  }
  if (!Array.isArray((value as { rules?: unknown }).rules)) {
    return { ok: false, error: 'rule set needs a rules list' };
  }
  const parsed = safeParseRuleSet(value);
  if (!parsed.ok) return parsed;
  return { ok: true, ruleSet: { ...layoutsDoc(), ...parsed.ruleSet } };
}

export function ruleSetToJson(ruleSet: RuleSet): string {
  return JSON.stringify(ruleSet);
}

/** JSON Schema for editors and validation tooling. */
export function ruleSetJsonSchema(): unknown {
  return z.toJSONSchema(RuleSetSchema, { target: 'draft-2020-12', unrepresentable: 'any' });
}
