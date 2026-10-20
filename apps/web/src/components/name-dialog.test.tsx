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

  it('keeps its keys from the page under it, whose Undo would change the layout behind', async () => {
    const user = userEvent.setup();
    const heard = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the editor's shortcuts
      <div onKeyDown={heard}>
        <NameDialog
          title="Save a copy"
          nameLabel="Name of the copy"
          initialName="Qwerty copy"
          submitLabel="Save copy"
          onSubmit={() => {}}
          onClose={() => {}}
        />
      </div>,
    );
    screen.getByRole('button', { name: 'Cancel' }).focus();
    await user.keyboard('{Control>}z{/Control}');
    expect(heard).not.toHaveBeenCalled();
  });

  it('tells its caller it was closed, by Cancel or by the browser', async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe('with a name another custom layout has', () => {
    const saved = [{ id: 'magic-breeze', name: 'Magic Breeze' }];
    function openTaken(initialName = 'Magic Breeze') {
      const onSubmit = vi.fn();
      const onOverwrite = vi.fn();
      render(
        <NameDialog
          title="Save a copy"
          nameLabel="Name of the copy"
          initialName={initialName}
          submitLabel="Save copy"
          taken={(name) =>
            saved.find((e) => e.name.toLowerCase() === name.trim().toLowerCase()) ?? null
          }
          onSubmit={onSubmit}
          onOverwrite={onOverwrite}
          onClose={() => {}}
        />,
      );
      return { onSubmit, onOverwrite };
    }

    it('says so, and offers to overwrite it instead of saving a second', async () => {
      const user = userEvent.setup();
      const { onSubmit, onOverwrite } = openTaken();
      expect(screen.getByRole('status')).toHaveTextContent(
        'A custom layout is already called Magic Breeze',
      );
      expect(screen.getByRole('button', { name: 'Save copy' })).toBeDisabled();
      fireEvent.submit(
        screen.getByLabelText('Name of the copy').closest('form') as HTMLFormElement,
      );
      expect(onSubmit).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Overwrite Magic Breeze' }));
      expect(onOverwrite).toHaveBeenCalledWith('Magic Breeze', saved[0]);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('only asks for another name when there is no overwriting', () => {
      render(
        <NameDialog
          title="Save under another name"
          nameLabel="Name of the layout"
          initialName="Magic Breeze"
          submitLabel="Save"
          taken={() => saved[0]}
          onSubmit={() => {}}
          onClose={() => {}}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'A custom layout is already called Magic Breeze. It could not be overwritten',
      );
      expect(screen.getByLabelText('Name of the layout')).toHaveAccessibleDescription(
        /already called Magic Breeze/,
      );
      expect(screen.getByLabelText('Name of the layout')).toBeInvalid();
      expect(screen.queryByRole('button', { name: /Overwrite/ })).not.toBeInTheDocument();
    });

    it('saves once another name is picked', async () => {
      const user = userEvent.setup();
      const { onSubmit } = openTaken();
      const field = screen.getByLabelText('Name of the copy');
      await user.type(field, ' 2');
      expect(screen.queryByRole('button', { name: /Overwrite/ })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('');
      await user.click(screen.getByRole('button', { name: 'Save copy' }));
      expect(onSubmit).toHaveBeenCalledWith('Magic Breeze 2');
    });
  });
});
