import { type Binding, compileLayout, type Layout } from '@layerbench/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { BindingEditor, type EditorScope } from './bodies.js';

const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'T',
  geometry: { preset: '3x5+2' },
  keys: { space: 'R0' },
  layers: [
    { id: 'base', name: 'Base', bindings: {} },
    { id: 'num', name: 'Num', bindings: {} },
  ],
};
const compiled = compileLayout(layout);
const scope: EditorScope = {
  compiled,
  text: { layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })), hostLocale: 'symbols' },
};

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

/** The key editor on a macro, keeping what it is changed to, as the inspector does. */
function edit(start: Binding, { refuse = false } = {}) {
  const seen: { current: Binding } = { current: start };
  const outside: { set: (b: Binding) => void } = { set: () => {} };
  function Harness() {
    const [value, setValue] = useState<Binding>(start);
    outside.set = setValue;
    return (
      <BindingEditor
        scope={scope}
        value={value}
        onChange={(b) => {
          seen.current = b;
          // A layout that refuses the edit keeps the key as it was.
          if (!refuse) setValue(b);
        }}
      />
    );
  }
  render(<Harness />);
  const steps = () => screen.getByRole('list', { name: 'Macro steps' });
  /** A change made elsewhere: an undo, the text line. */
  const from = (b: Binding) => act(() => outside.set(b));
  return { seen, steps, from, user: userEvent.setup() };
}

describe('the steps of a macro', () => {
  it('can each be any kind of key, edited with the controls a key has', async () => {
    const { seen, user } = edit({ kind: 'macro', steps: [kp('.')] });
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.selectOptions(screen.getByLabelText('Step 2 kind'), 'sentencespace');
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.type(screen.getByLabelText('Step 3 text'), ' {Enter}');
    expect(seen.current).toEqual({
      kind: 'macro',
      steps: [kp('.'), { kind: 'sentence_space' }, kp(' ')],
    });
    // What the steps need of ZMK is said on the macro: a sentence space needs zmk-sentence-case.
    expect(
      screen
        .getAllByRole('link')
        .some((a) => a.getAttribute('href')?.endsWith('rafaelromao/zmk-sentence-case')),
    ).toBe(true);
  });

  it('edits a layer step with the layer controls, armed for the next key', async () => {
    const { seen, user } = edit({ kind: 'macro', steps: [kp('ç')] });
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.selectOptions(screen.getByLabelText('Step 2 kind'), 'layer');
    const layers = screen.getByRole('group', { name: 'Step 2 layer' });
    await user.click(within(layers).getByRole('button', { name: /Num/ }));
    expect(seen.current).toEqual({
      kind: 'macro',
      steps: [kp('ç'), { kind: 'sl', layer: 'num' }],
    });
  });

  it('can be moved, duplicated and removed', async () => {
    const { seen, user } = edit({
      kind: 'macro',
      steps: [kp('a'), { kind: 'caps_word' }, kp('b')],
    });
    await user.click(screen.getByRole('button', { name: 'Move step 2 down' }));
    expect(seen.current).toEqual({
      kind: 'macro',
      steps: [kp('a'), kp('b'), { kind: 'caps_word' }],
    });
    await user.click(screen.getByRole('button', { name: 'Move step 3 up' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate step 2' }));
    expect(seen.current).toEqual({
      kind: 'macro',
      steps: [kp('a'), { kind: 'caps_word' }, { kind: 'caps_word' }, kp('b')],
    });
    await user.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(seen.current).toEqual({
      kind: 'macro',
      steps: [{ kind: 'caps_word' }, { kind: 'caps_word' }, kp('b')],
    });
  });

  it('switches a step’s kind, keeping what carries over', async () => {
    const { seen, user } = edit({ kind: 'macro', steps: [kp('a'), { kind: 'key_repeat' }] });
    await user.selectOptions(screen.getByLabelText('Step 2 kind'), 'tapdance');
    expect(seen.current).toMatchObject({
      kind: 'macro',
      steps: [kp('a'), { kind: 'tap_dance' }],
    });
    await user.selectOptions(screen.getByLabelText('Step 2 kind'), 'text');
    expect(screen.getByLabelText('Step 2 text')).toBeInTheDocument();
  });

  it('can be another macro, whose steps are edited inside it', async () => {
    const { seen, user } = edit({
      kind: 'macro',
      steps: [kp('a'), { kind: 'macro', steps: [kp('b')] }],
    });
    const inner = screen.getByRole('list', { name: 'Step 2 macro steps' });
    expect(within(inner).getByLabelText('Step 2 step 1 text')).toHaveValue('b');
    await user.click(screen.getByRole('button', { name: 'Step 2 add step' }));
    await user.selectOptions(screen.getByLabelText('Step 2 step 2 kind'), 'repeat');
    expect(seen.current).toEqual({
      kind: 'macro',
      steps: [kp('a'), { kind: 'macro', steps: [kp('b'), { kind: 'key_repeat' }] }],
    });
  });

  it('edits every macro step as it was before: text, a layer armed, a modifier armed', () => {
    edit({
      kind: 'macro',
      steps: [kp('ç'), { kind: 'sl', layer: 'num' }, { kind: 'sk', mod: 'LSHIFT' }],
    });
    expect(screen.getByLabelText('Step 1 text')).toHaveValue('ç');
    expect(screen.getByLabelText('Step 2 kind')).toHaveValue('layer');
    expect(screen.getByLabelText('Step 3 kind')).toHaveValue('modifier');
    expect(
      within(screen.getByRole('group', { name: 'Step 2 layer' })).getByRole('button', {
        name: /Num/,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers no macro step deeper than a layout can hold macros', () => {
    edit({
      kind: 'macro',
      steps: [{ kind: 'macro', steps: [{ kind: 'macro', steps: [kp('a'), kp('b')] }] }],
    });
    const options = (label: string) =>
      [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((o) => o.value);
    expect(options('Step 1 kind')).toContain('macro');
    expect(options('Step 1 step 1 kind')).toContain('macro');
    // The third macro's steps: a macro there would be a fourth.
    expect(options('Step 1 step 1 step 1 kind')).not.toContain('macro');
  });

  it('says a layer or a modifier held in a macro does nothing', async () => {
    const { user } = edit({ kind: 'macro', steps: [{ kind: 'sl', layer: 'num' }] });
    expect(screen.queryByText(/In a macro this does nothing/)).toBeNull();
    await user.click(
      within(screen.getByRole('group', { name: 'Step 1 how the layer comes on' })).getByRole(
        'radio',
        { name: 'Momentary' },
      ),
    );
    expect(screen.getByText(/In a macro this does nothing/)).toBeInTheDocument();
  });

  it('names the module its steps need once, on the outermost macro', () => {
    edit({
      kind: 'macro',
      steps: [kp('.'), { kind: 'macro', steps: [{ kind: 'sentence_space' }] }],
    });
    // Said by the outermost macro alone: neither the inner macro nor the step repeats it.
    const notes = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.endsWith('rafaelromao/zmk-sentence-case'));
    expect(notes).toHaveLength(1);
  });

  it('offers no macro in a step’s parts past the macros the editor lets nest', () => {
    const tapHold: Binding = { kind: 'hold_tap', tap: kp('a'), hold: kp('b') };
    edit({
      kind: 'macro',
      steps: [{ kind: 'macro', steps: [{ kind: 'macro', steps: [tapHold] }] }],
    });
    const options = (label: string) =>
      [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((o) => o.value);
    expect(options('Step 1 step 1 step 1 tap kind')).not.toContain('macro');
    expect(options('Step 1 step 1 step 1 hold kind')).not.toContain('macro');
  });

  it('goes back to what the key holds when the layout refuses an edit', async () => {
    const { user } = edit(
      { kind: 'macro', steps: [kp('a'), { kind: 'caps_word' }] },
      { refuse: true },
    );
    await user.selectOptions(screen.getByLabelText('Step 2 kind'), 'repeat');
    await waitFor(() => expect(screen.getByLabelText('Step 2 kind')).toHaveValue('capsword'));
  });

  it('follows a change made elsewhere, nested rows included', async () => {
    const { from } = edit({ kind: 'macro', steps: [kp('a'), { kind: 'macro', steps: [kp('b')] }] });
    await from({ kind: 'macro', steps: [kp('a'), { kind: 'macro', steps: [kp('c'), kp(' ')] }] });
    expect(screen.getByLabelText('Step 2 step 1 text')).toHaveValue('c ');
  });

  it('keeps a step’s text through a kind it does not hold, and back', async () => {
    const { seen, user } = edit({ kind: 'macro', steps: [kp('q'), kp('u')] });
    await user.selectOptions(screen.getByLabelText('Step 1 kind'), 'macro');
    expect(seen.current).toEqual({ kind: 'macro', steps: [{ kind: 'macro', symbols: 'qu' }] });
    await user.selectOptions(screen.getByLabelText('Step 1 kind'), 'repeat');
    await user.selectOptions(screen.getByLabelText('Step 1 kind'), 'text');
    expect(screen.getByLabelText('Step 1 text')).toHaveValue('qu');
  });

  it('says a held layer does nothing only on the step itself, not on a tap-hold step’s hold', () => {
    edit({
      kind: 'macro',
      steps: [
        { kind: 'hold_tap', tap: kp('a'), hold: { kind: 'mo', layer: 'num' } },
        { kind: 'mo', layer: 'num' },
      ],
    });
    expect(screen.getAllByText(/In a macro this does nothing/)).toHaveLength(1);
  });
});
