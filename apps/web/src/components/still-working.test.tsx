import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StillWorking } from './StillWorking.js';

afterEach(() => vi.useRealTimers());

describe('a wait that goes on', () => {
  it('says nothing at first, and says so, with a way out, once it has gone on too long', () => {
    vi.useFakeTimers();
    render(<StillWorking after={10_000}>It is taking a while.</StillWorking>);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => vi.advanceTimersByTime(9_999));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status')).toHaveTextContent('It is taking a while.');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('leaves no timer behind when what was waited for finishes in time', () => {
    vi.useFakeTimers();
    const { unmount } = render(<StillWorking after={5_000}>Slow.</StillWorking>);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('takes the place it is given only once it shows', () => {
    vi.useFakeTimers();
    const { container } = render(
      <StillWorking after={1_000} className="mx-3 mt-2">
        Slow.
      </StillWorking>,
    );
    // Nothing of it before then, so nothing moves on the page for a wait that is over in time.
    expect(container).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole('status')).toHaveClass('mx-3', 'mt-2');
  });
});
