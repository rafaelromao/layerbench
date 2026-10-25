import { describe, expect, it } from 'vitest';
import { corpusStream } from '../corpus/corpus.js';
import { nodeCorpusLoader } from '../corpus/node-loader.js';
import breezeJson from '../fixtures/magic-breeze.json';
import { corporaRoot } from '../golden/paths.js';
import { compileLayout } from '../layout/compile.js';
import { parseLayout } from '../layout/schema.js';
import { explain, simulate } from './resolver.js';

const breeze = parseLayout(breezeJson);
const compiled = compileLayout(breeze);
const options = { caseMode: 'fold', crossWord: 'reset' } as const;

describe('Magic Breeze one-shot layer timeout', () => {
  it.each(['fold', 'model'] as const)('types e, l and i after ç in %s mode', (caseMode) => {
    const text = 'çe çl çi';
    const r = explain(compiled, text, { ...options, caseMode });
    expect(r.steps.map((s) => s.symbols).join('')).toBe(text);
    expect([...r.coverage.unproducible]).toEqual([]);
  });

  it('types Bahçeli, the corpus word that lost exactly e, l and i on the live site', () => {
    const r = explain(compiled, 'bahçeli', options);
    expect(r.steps.map((s) => s.symbols).join('')).toBe('bahçeli');
    expect([...r.coverage.unproducible]).toEqual([]);
    expect(r.steps.slice(-3).map((s) => s.key)).toEqual(['R0', 'LTI', 'RHR']);
  });

  it('uses the extension immediately when its follow-up macro types the text', () => {
    const r = explain(compiled, 'ções', options);
    expect(r.steps.map((s) => s.symbols).join('')).toBe('ções');
    expect(r.steps.map((s) => s.key)).toEqual(['LBI', 'LBM', 'LHI']);
  });

  it('restores the armed extension when waiting cannot type a missing character', () => {
    const r = explain(compiled, 'çψões', options);
    expect([...r.coverage.unproducible]).toEqual([['ψ', 1]]);
    expect(r.steps.map((s) => s.symbols).join('')).toBe('ções');
    expect(r.steps.map((s) => s.key)).toEqual(['LBI', 'LBM', 'LHI']);
  });

  it('does not time out a toggled layer', () => {
    const layout = structuredClone(breeze);
    layout.layers.find((l) => l.id === 'alpha2-copy')!.bindings.LBM = {
      kind: 'macro',
      symbols: 'ç',
      then: [{ kind: 'tog', layer: 'ccedil' }],
    };
    const r = explain(compileLayout(layout), 'çe', options);
    expect([...r.coverage.unproducible]).toEqual([['e', 1]]);
  });

  it('does not enable a typing path the user disabled', () => {
    const layout = {
      ...breeze,
      typingPaths: { e: [{ producer: 'direct:alpha1/R0', enabled: false }] },
    };
    const r = explain(compileLayout(layout), 'çe', options);
    expect([...r.coverage.unproducible]).toEqual([['e', 1]]);
  });

  it('types the live English ranking sample without skipped characters', async () => {
    const corpus = await nodeCorpusLoader(corporaRoot()).load('en-general');
    const r = simulate(compiled, corpusStream(corpus, 'fold', 'letters'), {
      ...options,
      maxSymbols: 100_000,
    });
    expect([...r.coverage.unproducible]).toEqual([]);
  });
});
