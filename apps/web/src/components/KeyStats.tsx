import type { CompiledLayout, RuleItem } from '@layoutmaster/core';
import { useState } from 'react';
import { type KeyNumberRow, keyNumbers } from '../engine/key-numbers.js';
import type { KeyStatsDTO, ReportDTO } from '../engine/protocol.js';
import { HELP } from '../guide/help.js';
import { formatItem, formatPart, formatValue, qualityBorder, shortLabel } from './format.js';
import { HelpLink } from './HelpLink.js';
import { KEY_STATS_IDS } from './Metrics.js';
import { PressedFor, reachedLayer } from './PairBreakdown.js';

/** An n-gram picked from a key's list, to be outlined on the board. */
export interface KeyItemSelection {
  ruleId: string;
  item: RuleItem;
}

/** How many of a rule's n-grams through the key show before the rest are asked for. */
const FIRST_ITEMS = 6;

function percentOf(share: number): string {
  const p = share * 100;
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
}

/**
 * What a key produces on the layer shown: its share of the presses, its part of every number that
 * adds up over keys — each key's parts add up to the number, as the heat map draws them — the
 * n-grams of each it takes part in, and for a layer key what it was pressed for. The parts follow
 * whatever report is shown, an estimate included; the lists come from the worker a moment later.
 */
export function KeyStats({
  compiled,
  report,
  keyId,
  layer,
  stats,
  updating,
  onSelectItem,
}: {
  compiled: CompiledLayout;
  report: ReportDTO;
  keyId: string;
  layer: number;
  stats: KeyStatsDTO | null;
  updating: boolean;
  onSelectItem?: (selection: KeyItemSelection) => void;
}) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showNext, setShowNext] = useState(false);
  const key = compiled.keyIndex.get(keyId);
  if (key === undefined) return null;

  const layerName = compiled.layers[layer]?.name ?? String(layer);
  const numbers = keyNumbers(report, key, layer);
  const pressed = numbers.presses + numbers.chordPresses;
  const shown: KeyNumberRow[] = all
    ? numbers.rows
    : KEY_STATS_IDS.map((id) => numbers.rows.find((r) => r.result.id === id)).filter(
        (r): r is KeyNumberRow => r !== undefined,
      );
  const listOf = (id: string) => stats?.rules.find((r) => r.id === id);
  const next = stats?.next ?? [];
  const headingId = `key-stats-${keyId}`;

  return (
    <section className="lm-key-stats space-y-2" aria-labelledby={headingId}>
      <div className="flex items-center gap-2">
        <h3 id={headingId} className="text-xs font-semibold">
          Its numbers on {layerName}
        </h3>
        <HelpLink help={HELP.keyNumbers} />
        {updating && <span className="text-[11px] opacity-60">updating…</span>}
      </div>

      <p className="text-xs">
        {pressed === 0 ? (
          <span className="opacity-70">Not pressed on {layerName} in this text.</span>
        ) : (
          <>
            <span className="font-mono tabular-nums">
              {numbers.total > 0 ? ((numbers.presses / numbers.total) * 100).toFixed(2) : '0.00'}%
            </span>{' '}
            of the presses ({numbers.presses.toLocaleString('en-US')})
            {numbers.chordPresses > 0 && (
              <span>, and {numbers.chordPresses.toLocaleString('en-US')} in combos</span>
            )}
            {numbers.layerTaps > 0 && (
              <span>
                , {numbers.layerTaps === numbers.presses ? 'every one' : numbers.layerTaps} to reach
                a layer
              </span>
            )}
          </>
        )}
      </p>

      {pressed > 0 && (
        <ul className="lm-key-parts" aria-label={`Parts of ${keyId} on ${layerName}`}>
          {shown.map(({ result, part, share }) => {
            const list = listOf(result.id);
            const body = (
              <>
                <span className="lm-key-part-label">{shortLabel(result.id, result.label)}</span>
                <span className="font-mono tabular-nums">{formatPart(part, result.unit)}</span>
                <span className="opacity-60 max-sm:sr-only">
                  {' '}
                  of {formatValue(result.value, result.unit)}
                </span>
                <span className="font-mono tabular-nums opacity-70 ml-auto">
                  {share === null ? '–' : percentOf(share)}
                </span>
              </>
            );
            const look = `lm-key-part border-l-4 ${qualityBorder(result.band)} ${
              part === 0 ? 'opacity-50' : ''
            }`;
            return (
              <li key={result.id}>
                {list && list.items.length > 0 ? (
                  <button
                    type="button"
                    className={`${look} w-full text-left hover:bg-base-200`}
                    aria-expanded={open === result.id}
                    onClick={() => setOpen(open === result.id ? null : result.id)}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={look}>{body}</div>
                )}
                {open === result.id && list && (
                  <KeyItems
                    label={`${result.label} through ${keyId} on ${layerName}`}
                    items={list.items}
                    busy={updating}
                    onSelect={(item) => onSelectItem?.({ ruleId: result.id, item })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pressed > 0 && numbers.rows.length > KEY_STATS_IDS.length && (
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAll(!all)}>
          {all ? 'Fewer numbers' : `Every number (${numbers.rows.length})`}
        </button>
      )}

      {next.length > 0 && (
        <div className="text-xs space-y-1">
          <p>
            <span className="font-semibold">Pressed for: </span>
            {next.slice(0, 6).map((n, i) => (
              <span key={`${n.layer}-${n.key}-${n.label}`}>
                {i > 0 && ' · '}
                <span className="font-mono">{n.label}</span> {percentOf(n.share)}
              </span>
            ))}
            {next.length > 6 && ' …'}
          </p>
          <button
            type="button"
            className="btn btn-xs"
            aria-haspopup="dialog"
            onClick={() => setShowNext(true)}
          >
            On {compiled.layers[reachedLayer(next)]?.name ?? 'its'} board
          </button>
          {showNext && (
            <PressedFor
              compiled={compiled}
              next={next}
              onClose={() => setShowNext(false)}
              title={
                <>
                  <span className="font-mono">{keyId}</span>
                  <span className="font-normal opacity-60"> · pressed for</span>
                </>
              }
              description={(reached) => (
                <>
                  The keys pressed right after {keyId} on {layerName}, on {reached}, and each one's
                  share of them.
                </>
              )}
            />
          )}
        </div>
      )}
    </section>
  );
}

function KeyItems({
  label,
  items,
  busy,
  onSelect,
}: {
  label: string;
  items: RuleItem[];
  busy: boolean;
  onSelect: (item: RuleItem) => void;
}) {
  const [more, setMore] = useState(false);
  const shown = more ? items : items.slice(0, FIRST_ITEMS);
  return (
    <div className="pl-2 py-1 space-y-1">
      <ol className="space-y-0.5" aria-label={label} aria-busy={busy}>
        {shown.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rank is the identity of a row
          <li key={`${item.label}-${i}`} className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="font-mono text-left flex-1 truncate hover:underline"
              // A pair ending on a layer key opens what that key was pressed for.
              aria-haspopup={item.then?.length ? 'dialog' : undefined}
              onClick={() => onSelect(item)}
            >
              {item.label}
            </button>
            <span className="font-mono tabular-nums opacity-70">{formatItem(item)}</span>
          </li>
        ))}
      </ol>
      {items.length > FIRST_ITEMS && (
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMore(!more)}>
          {more ? 'Fewer' : `Show ${items.length}`}
        </button>
      )}
      <p className="text-[11px] opacity-60">
        Each with its share of what the number counts; a pair counts half on each of its keys.
      </p>
    </div>
  );
}
