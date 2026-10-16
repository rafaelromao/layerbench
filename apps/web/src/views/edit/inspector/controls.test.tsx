import { compileLayout, type Layout, type Mod } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LayerChips, ModChips, Segment, TextAreaField, TextField } from './controls.js';

const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'T',
  geometry: { preset: '3x5+2' },
  keys: { space: 'R0' },
  layers: [
    { id: 'base', name: 'Base', bindings: {} },
    { id: 'nav', name: 'Nav', bindings: {} },
    { id: 'sym', name: 'Sym', color: 'red', bindings: {} },
  ],
};

describe('Segment', () => {
  it('shows the chosen option and reports another', async () => {
    const onChange = vi.fn();
    render(
      <Segment
        label="Kind"
        options={[
          ['a', 'Alpha'],
          ['b', 'Beta'],
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('LayerChips', () => {
  it('presses the layers it is given and reports a click', async () => {
    const onChange = vi.fn();
    render(
      <LayerChips
        compiled={compileLayout(layout)}
        label="Layers"
        value={['nav']}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Nav' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Base' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Sym' }));
    expect(onChange).toHaveBeenCalledWith('sym');
  });
});

describe('ModChips', () => {
  const setup = (value: Mod[]) => {
    const onChange = vi.fn();
    render(<ModChips label="Mod" value={value} onChange={onChange} />);
    return onChange;
  };

  it('picks the left key of a modifier when the left hand is in use', async () => {
    const onChange = setup(['LSHIFT']);
    await userEvent.click(screen.getByRole('button', { name: 'Control' }));
    expect(onChange).toHaveBeenCalledWith('LCTRL');
    expect(screen.getByRole('button', { name: 'Shift' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('picks the right key when the right hand is in use', async () => {
    const onChange = setup(['RALT']);
    await userEvent.click(screen.getByRole('button', { name: 'Command' }));
    expect(onChange).toHaveBeenCalledWith('RGUI');
  });

  it('flips the hand of the modifier it has', async () => {
    const left = setup(['LSHIFT']);
    await userEvent.click(screen.getByRole('button', { name: 'Left-hand modifier' }));
    expect(left).toHaveBeenCalledWith('RSHIFT');
  });

  it('flips from the right hand back to the left', async () => {
    const right = setup(['RCTRL']);
    await userEvent.click(screen.getByRole('button', { name: 'Right-hand modifier' }));
    expect(right).toHaveBeenCalledWith('LCTRL');
  });

  it('has nothing to flip when no modifier is on', async () => {
    const none = setup([]);
    await userEvent.click(screen.getByRole('button', { name: 'Left-hand modifier' }));
    expect(none).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('commits on Enter and when it is left, only if the text changed', async () => {
    const onCommit = vi.fn();
    render(<TextField label="Name" value="abc" onCommit={onCommit} />);
    const input = screen.getByLabelText('Name');
    await userEvent.type(input, 'd{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith('abcd');
    await userEvent.type(input, 'e');
    await userEvent.tab();
    expect(onCommit).toHaveBeenLastCalledWith('abcde');
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('does not commit text it already had', async () => {
    const onCommit = vi.fn();
    render(<TextField label="Name" value="abc" onCommit={onCommit} />);
    await userEvent.type(screen.getByLabelText('Name'), '{Enter}');
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('puts its text back on Escape, and keeps the Escape to itself while it changed', async () => {
    const outer = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: a stand-in for the editor that closes on Escape
      <div onKeyDown={outer}>
        <TextField label="Name" value="abc" onCommit={() => {}} />
      </div>,
    );
    const input = screen.getByLabelText('Name');
    await userEvent.type(input, 'x{Escape}');
    expect(input).toHaveValue('abc');
    expect(outer).toHaveBeenCalledTimes(1);
    await userEvent.type(input, '{Escape}');
    expect(outer).toHaveBeenCalledTimes(2);
  });

  it('lets a handler of its own take a key first', async () => {
    const onCommit = vi.fn();
    render(
      <TextField
        label="Name"
        value="abc"
        onCommit={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
      />,
    );
    await userEvent.type(screen.getByLabelText('Name'), 'x{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('TextAreaField', () => {
  it('commits when it is left and goes back to its text on Escape', async () => {
    const onCommit = vi.fn();
    render(<TextAreaField label="About" value="one" onCommit={onCommit} />);
    const area = screen.getByLabelText('About');
    await userEvent.type(area, ' two{Escape}');
    expect(area).toHaveValue('one');
    await userEvent.type(area, ' three');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith('one three');
  });

  it('commits nothing when the text is as it was', async () => {
    const onCommit = vi.fn();
    render(<TextAreaField label="About" value="one" onCommit={onCommit} />);
    await userEvent.click(screen.getByLabelText('About'));
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
