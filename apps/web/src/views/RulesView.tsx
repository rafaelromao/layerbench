import {
  DEFAULT_GLOBALS,
  getPreset,
  layoutsDoc,
  PRESET_IDS,
  type Rule,
  ruleSetFromJson,
  slug,
} from '@layerbench/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { HelpLink } from '../components/HelpLink.js';
import { presetOf, RuleSources } from '../components/RuleSources.js';
import { HELP } from '../guide/help.js';
import { useCarried } from '../state/selection.js';
import { toast } from '../state/toasts.js';
import { useCollection, useStorage } from '../storage/use-storage.js';
import type { RawSearch } from '../url/params.js';
import {
  boundsText,
  COMPOSER_AGGREGATES,
  type ComposerState,
  FAMILIES,
  FINGER_NAMES,
  KEY_KINDS,
  PREDICATE_TYPES,
  ROWS,
} from './rules/composer.js';
import { describeSource, describeWhere } from './rules/describe.js';
import { initialRulesState, removedBuiltIns, rulesReducer } from './rules/reducer.js';
import { useRuleSet } from './useRuleSet.js';

const FAMILY_TITLES: [string, string][] = [
  ['bigram', 'Bigrams'],
  ['skipgram', 'Skipgrams'],
  ['trigram', 'Trigrams'],
  ['usage', 'Usage'],
  ['effort', 'Effort'],
  ['layer', 'Layers'],
  ['other', 'Other'],
];

/** The value widget a predicate row shows, chosen by the predicate's type. */
function PredicateValue({
  type,
  value,
  index,
  onChange,
}: {
  type: string;
  value: string;
  index: number;
  onChange: (value: string) => void;
}) {
  const widget = PREDICATE_TYPES.find((p) => p.value === type)?.widget ?? 'text';
  const label = `Predicate ${index + 1} value`;
  const cls = 'select select-xs select-bordered';

  switch (widget) {
    case 'bool':
      return (
        <select
          aria-label={label}
          className={cls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    case 'direction':
      return (
        <select
          aria-label={label}
          className={cls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="inward">inward</option>
          <option value="outward">outward</option>
        </select>
      );
    case 'finger':
      return (
        <select
          aria-label={label}
          className={cls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {FINGER_NAMES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      );
    case 'row':
      return (
        <select
          aria-label={label}
          className={cls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {ROWS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      );
    case 'kind':
      return (
        <select
          aria-label={label}
          className={cls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {KEY_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      );
    case 'flag':
      return <span className="text-xs opacity-60 w-28">violated</span>;
    default:
      return (
        <input
          aria-label={label}
          className="input input-xs input-bordered w-28"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function RulesView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  // Analyzing with a set keeps the corpus and the rest of the choices in force.
  const carried = useCarried();
  const storage = useStorage();
  const savedSets = useCollection('rulesets');
  const ref = search.rules ?? 'layouts_doc';
  const resolved = useRuleSet(ref, 'no_space');

  const [state, send] = useReducer(rulesReducer, initialRulesState(getPreset(ref), ref));
  const [saveName, setSaveName] = useState('My rules');

  // Loading a different set replaces everything, including anything unsaved.
  useEffect(() => {
    send({ type: 'load', ruleSet: resolved, ref });
  }, [resolved, ref]);

  useEffect(() => {
    if (!state.notice) return;
    toast.info(state.notice);
    send({ type: 'clearNotice' });
  }, [state.notice]);

  const { ruleSet, composer } = state;
  const globals = { ...DEFAULT_GLOBALS, ...ruleSet.globals };

  const save = useCallback(async () => {
    const id = slug(saveName);
    try {
      await storage.put(
        'rulesets',
        id,
        { ...ruleSet, id, name: saveName } as Record<string, unknown>,
        { message: `Save rule set ${saveName}` },
      );
      send({ type: 'saved', ref: `saved:${id}` });
      toast.info(`Saved rule set ${id}`);
      savedSets.refresh();
      navigate({
        to: '/rules',
        search: { rules: `saved:${id}` } as never,
        replace: true,
        resetScroll: false,
      });
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [saveName, ruleSet, storage, savedSets, navigate]);

  const importJson = useCallback(() => {
    const parsed = ruleSetFromJson(state.jsonText);
    if (!parsed.ok) {
      send({ type: 'jsonError', error: parsed.error });
      return;
    }
    send({ type: 'importJson', ruleSet: { ...layoutsDoc(), ...parsed.ruleSet } });
    toast.info('Rule set imported');
  }, [state.jsonText]);

  const setComposer = (patch: Partial<ComposerState>) => send({ type: 'composerChange', patch });
  const removed = removedBuiltIns(ruleSet);

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Rules</h1>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3 p-4">
          <div className="lb-toolbar flex flex-wrap items-end gap-3">
            <div className="lb-wide flex items-end gap-2">
              <label className="form-control max-sm:flex-1">
                <span className="label-text text-xs">Rule set</span>
                <select
                  aria-label="Rule set"
                  className="select select-sm select-bordered min-w-56"
                  value={ref}
                  onChange={(e) =>
                    navigate({ to: '/rules', search: { rules: e.target.value } as never })
                  }
                >
                  <optgroup label="Presets">
                    {PRESET_IDS.map((id) => (
                      <option key={id} value={id}>
                        {getPreset(id).name}
                      </option>
                    ))}
                  </optgroup>
                  {savedSets.entries.length > 0 && (
                    <optgroup label="Saved">
                      {savedSets.entries.map((e) => (
                        <option key={e.id} value={`saved:${e.id}`}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <HelpLink help={HELP.rules} className="mb-2" />
            </div>

            <p className="lb-wide text-xs opacity-70 max-w-xl">{ruleSet.description}</p>
            {state.dirty && (
              <span className="lb-wide justify-self-start badge badge-warning badge-sm">
                unsaved changes
              </span>
            )}

            <form
              className="lb-wide flex items-end gap-2 sm:ml-auto"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="form-control max-sm:flex-1">
                <span className="label-text text-xs">Save as</span>
                <input
                  aria-label="Rule set name"
                  className="input input-sm input-bordered"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-sm">
                Save
              </button>
            </form>

            <Link
              to="/analyze"
              search={carried({ rules: state.sourceRef }) as never}
              className="lb-wide btn btn-sm btn-primary"
            >
              Analyze with this set
            </Link>
          </div>

          <div className="lb-toolbar flex flex-wrap items-end gap-3 border-t border-base-300 pt-3">
            <label className="form-control">
              <span className="label-text text-xs">Universe</span>
              <select
                aria-label="Universe"
                className="select select-xs select-bordered"
                value={globals.universe}
                onChange={(e) =>
                  send({ type: 'setGlobal', name: 'universe', value: e.target.value })
                }
              >
                <option value="no_space">no space</option>
                <option value="with_space">with space</option>
              </select>
            </label>

            <label className="form-control">
              <span className="label-text text-xs">Word boundary</span>
              <select
                aria-label="Word boundary"
                className="select select-xs select-bordered"
                value={globals.cross_word}
                onChange={(e) =>
                  send({ type: 'setGlobal', name: 'cross_word', value: e.target.value })
                }
              >
                <option value="reset">reset n-grams</option>
                <option value="bridge">bridge words</option>
              </select>
            </label>

            <label className="form-control">
              <span className="label-text text-xs">Distance</span>
              <select
                aria-label="Distance model"
                className="select select-xs select-bordered"
                value={globals.distance_model}
                onChange={(e) =>
                  send({ type: 'setGlobal', name: 'distance_model', value: e.target.value })
                }
              >
                <option value="euclid">euclid</option>
                <option value="squared">squared</option>
                <option value="manhattan">manhattan</option>
              </select>
            </label>

            <label className="form-control">
              <span className="label-text text-xs">Normalization</span>
              <select
                aria-label="Normalization"
                className="select select-xs select-bordered"
                value={globals.normalization}
                onChange={(e) =>
                  send({ type: 'setGlobal', name: 'normalization', value: e.target.value })
                }
              >
                <option value="percent_of_ngrams">% of n-grams</option>
                <option value="percent_of_keystrokes">% of keystrokes</option>
              </select>
            </label>

            <label className="form-control">
              <span className="label-text text-xs">Skip weights</span>
              <input
                aria-label="Skip weights"
                className="input input-xs input-bordered w-32"
                defaultValue={globals.skip_weights.join(', ')}
                onBlur={(e) =>
                  send({ type: 'setGlobal', name: 'skip_weights', value: e.target.value })
                }
              />
            </label>

            <label className="form-control">
              <span className="label-text text-xs">LSB adjacent (U)</span>
              <input
                type="number"
                step="0.25"
                aria-label="LSB adjacent distance"
                className="input input-xs input-bordered w-24"
                defaultValue={globals.lsb_adjacent_u}
                onBlur={(e) =>
                  send({ type: 'setGlobal', name: 'lsb_adjacent_u', value: e.target.value })
                }
              />
            </label>

            <label className="label cursor-pointer gap-2">
              <span className="label-text text-xs">Composite score</span>
              <input
                type="checkbox"
                aria-label="Composite score"
                className="toggle toggle-xs"
                checked={ruleSet.score_enabled ?? false}
                onChange={() => send({ type: 'toggleScore' })}
              />
            </label>
          </div>
        </div>
      </section>

      {FAMILY_TITLES.map(([family, title]) => {
        const rules = ruleSet.rules.filter((r) => (r.family ?? 'other') === family);
        if (rules.length === 0) return null;
        // The table is wider than a phone, so the card scrolls; tabIndex lets a keyboard reach it.
        return (
          <section
            key={family}
            className="card bg-base-100 border border-base-300 overflow-x-auto"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard.
            tabIndex={0}
            aria-label={title}
          >
            <div className="card-body gap-2 p-4">
              <h2 className="text-sm uppercase tracking-wide opacity-60">{title}</h2>
              <table className="lb-rules-table table table-xs min-w-[56rem]">
                <thead>
                  <tr>
                    <th />
                    <th>Rule</th>
                    <th>Definition</th>
                    <th>Aggregate</th>
                    <th>Bands (upper bounds)</th>
                    <th>Weight</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule: Rule) => (
                    <tr key={rule.id} className={rule.enabled === false ? 'opacity-40' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          aria-label={`Enable ${rule.label ?? rule.id}`}
                          checked={rule.enabled !== false}
                          onChange={() => send({ type: 'toggleRule', id: rule.id })}
                        />
                      </td>
                      <td>
                        <div className="font-semibold">{rule.label ?? rule.id}</div>
                        {rule.description && (
                          <div className="text-[11px] opacity-60 max-w-xs">{rule.description}</div>
                        )}
                        <div className="text-[10px] font-mono opacity-50">{rule.id}</div>
                        <div className="max-w-xs mt-1">
                          <RuleSources ruleId={rule.id} presetId={presetOf(ref)} />
                        </div>
                      </td>
                      <td
                        data-label="Definition"
                        className="text-[11px] font-mono opacity-70 max-w-sm truncate"
                      >
                        {describeSource(rule)} · {describeWhere(rule.where)}
                      </td>
                      <td data-label="Aggregate" className="text-[11px] font-mono">
                        {rule.aggregate ?? 'percent_of_ngrams'}
                      </td>
                      <td data-label="Bands">
                        <input
                          aria-label={`Band bounds for ${rule.label ?? rule.id}`}
                          placeholder="e.g. 0.5, 1, 1.5"
                          className="input input-xs input-bordered w-40 font-mono"
                          defaultValue={boundsText(rule)}
                          onBlur={(e) =>
                            send({ type: 'setBounds', id: rule.id, value: e.target.value })
                          }
                        />
                      </td>
                      <td data-label="Weight">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          aria-label={`Score weight for ${rule.label ?? rule.id}`}
                          className="input input-xs input-bordered w-20"
                          defaultValue={rule.score?.weight ?? 0}
                          onBlur={(e) =>
                            send({ type: 'setWeight', id: rule.id, value: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          aria-label={`Remove ${rule.label ?? rule.id}`}
                          onClick={() => send({ type: 'removeRule', id: rule.id })}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {removed.length > 0 && (
        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 p-4">
            <h2 className="text-sm uppercase tracking-wide opacity-60">Removed built-ins</h2>
            <div className="flex flex-wrap gap-2">
              {removed.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className="btn btn-xs"
                  onClick={() => send({ type: 'restoreRule', id: rule.id })}
                >
                  + {rule.label ?? rule.id}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3 p-4">
          <div>
            <h2 className="font-semibold text-sm">Composer</h2>
            <p className="text-xs opacity-70">
              Build a rule from the same vocabulary the built-in ones use.
            </p>
          </div>

          <form
            id="composer-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              send({ type: 'composerAddRule' });
            }}
          >
            <div className="flex flex-wrap gap-2">
              <label className="form-control">
                <span className="label-text text-xs">Id</span>
                <input
                  aria-label="Rule id"
                  placeholder="my_rule"
                  className="input input-xs input-bordered font-mono"
                  value={composer.id}
                  onChange={(e) => setComposer({ id: e.target.value })}
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Label</span>
                <input
                  aria-label="Rule label"
                  className="input input-xs input-bordered"
                  value={composer.label}
                  onChange={(e) => setComposer({ label: e.target.value })}
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Family</span>
                <select
                  aria-label="Rule family"
                  className="select select-xs select-bordered"
                  value={composer.family}
                  onChange={(e) =>
                    setComposer({ family: e.target.value as ComposerState['family'] })
                  }
                >
                  {FAMILIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Keys (n)</span>
                <select
                  aria-label="N-gram size"
                  className="select select-xs select-bordered"
                  value={composer.n}
                  onChange={(e) => setComposer({ n: e.target.value as ComposerState['n'] })}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Skip</span>
                <select
                  aria-label="Skip"
                  className="select select-xs select-bordered"
                  value={composer.skip}
                  onChange={(e) => setComposer({ skip: e.target.value as ComposerState['skip'] })}
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="1-3">1-3</option>
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Aggregate</span>
                <select
                  aria-label="Aggregate"
                  className="select select-xs select-bordered"
                  value={composer.aggregate}
                  onChange={(e) =>
                    setComposer({ aggregate: e.target.value as ComposerState['aggregate'] })
                  }
                >
                  {COMPOSER_AGGREGATES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Combine</span>
                <select
                  aria-label="Combinator"
                  className="select select-xs select-bordered"
                  value={composer.combinator}
                  onChange={(e) =>
                    setComposer({ combinator: e.target.value as ComposerState['combinator'] })
                  }
                >
                  <option value="all">all</option>
                  <option value="any">any</option>
                  <option value="none">none</option>
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Score weight</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  aria-label="Composer score weight"
                  className="input input-xs input-bordered w-20"
                  value={composer.weight}
                  onChange={(e) => setComposer({ weight: e.target.value })}
                />
              </label>
            </div>

            <div className="space-y-2">
              {composer.predicates.map((p, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: two rows may test the same thing
                  key={`${p.type}-${i}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <select
                    aria-label={`Predicate ${i + 1} type`}
                    className="select select-xs select-bordered"
                    value={p.type}
                    onChange={(e) =>
                      send({
                        type: 'composerSetPredicate',
                        index: i,
                        patch: { type: e.target.value },
                      })
                    }
                  >
                    {PREDICATE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <PredicateValue
                    type={p.type}
                    value={p.value}
                    index={i}
                    onChange={(value) =>
                      send({ type: 'composerSetPredicate', index: i, patch: { value } })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label={`Remove predicate ${i + 1}`}
                    onClick={() => send({ type: 'composerRemovePredicate', index: i })}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => send({ type: 'composerAddPredicate' })}
              >
                + predicate
              </button>
              <button type="submit" className="btn btn-xs btn-primary">
                Add rule to set
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-2 p-4">
          <h2 className="font-semibold text-sm">JSON</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => send({ type: 'exportJson' })}
            >
              Export current
            </button>
          </div>
          <textarea
            wrap="off"
            aria-label="Rule set JSON"
            rows={8}
            className="textarea textarea-bordered w-full font-mono text-xs"
            value={state.jsonText}
            onChange={(e) => send({ type: 'jsonChange', text: e.target.value })}
          />
          {state.jsonError && <p className="text-error text-xs">{state.jsonError}</p>}
          <button type="button" className="btn btn-sm btn-primary self-start" onClick={importJson}>
            Import (replace current)
          </button>
        </div>
      </section>
    </div>
  );
}
