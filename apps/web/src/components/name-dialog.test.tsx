import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NameDialog } from './NameDialog.js';

function open(onSubmit = vi.fn(), onClose = vi.fn()) {
  render(
    <NameDialog
      title="Save a copy"
      intro="What should it be called?"
      nameLabel="Name of the copy"
      initialName="Qwerty copy"
      submitLabel="Save copy"
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <p>more to ask</p>
    </NameDialog>,
  );
  return { onSubmit, onClose };
}

describe('NameDialog', () => {
  it('opens as it mounts, with the name offered and what is asked beside it', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Save a copy' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('What should it be called?')).toBeInTheDocument();
    expect(screen.getByText('more to ask')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of the copy')).toHaveValue('Qwerty copy');
  });

  it('hands over the name as typed, trimmed', async () => {
    const user = userEvent.setup();
    const { onSubmit } = open();
    const field = screen.getByLabelText('Name of the copy');
    await user.clear(field);
    await user.type(field, '  Mine ');
    await user.click(screen.getByRole('button', { name: 'Save copy' }));
    expect(onSubmit).toHaveBeenCalledWith('Mine');
  });

  it('refuses an empty name, however it is submitted', async () => {
    const user = userEvent.setup();
    const { onSubmit } = open();
    await user.clear(screen.getByLabelText('Name of the copy'));
    expect(screen.getByRole('button', { name: 'Save copy' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Name of the copy').closest('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('tells its caller it was closed, by Cancel or by the browser', async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
