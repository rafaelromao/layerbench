import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToasts } from './toasts.js';

const shown = () => useToasts.getState().toasts.map((t) => t.text);

beforeEach(() => {
  vi.useFakeTimers();
  useToasts.setState({ toasts: [] });
});
afterEach(() => vi.useRealTimers());

describe('toasts', () => {
  it('go after six seconds, as every one did', () => {
    toast.info('Saved Colemak');
    toast.error('Save failed');
    expect(shown()).toEqual(['Saved Colemak', 'Save failed']);
    vi.advanceTimersByTime(5999);
    expect(shown()).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
  });

  it('say the same twice when saved twice', () => {
    toast.info('Saved Colemak');
    toast.info('Saved Colemak');
    expect(shown()).toEqual(['Saved Colemak', 'Saved Colemak']);
  });

  it('stay, when sticky, until they are closed, and are shown once however often they are pushed', () => {
    toast.info('Your change to Enthium was accepted; your copy of it is gone', { sticky: true });
    toast.info('Your change to Enthium was accepted; your copy of it is gone', { sticky: true });
    vi.advanceTimersByTime(10 * 60 * 1000);
    const [only, ...rest] = useToasts.getState().toasts;
    expect(rest).toEqual([]);
    expect(only?.text).toBe('Your change to Enthium was accepted; your copy of it is gone');
    useToasts.getState().dismiss(only?.id ?? 0);
    expect(shown()).toEqual([]);
  });
});
