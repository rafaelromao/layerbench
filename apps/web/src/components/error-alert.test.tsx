import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ErrorAlert } from './ErrorAlert.js';

describe('a message about something wrong', () => {
  it('closes, and comes back only when the message changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ErrorAlert message="Feature capsWord: no key given" />);
    await user.click(screen.getByRole('button', { name: 'Close message' }));
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<ErrorAlert message="Feature capsWord: no key given" />);
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<ErrorAlert message="Could not analyze: no corpus" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not analyze: no corpus');
  });
});
