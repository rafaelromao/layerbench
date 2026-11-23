import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportImageButton } from './ExportImageButton.js';

describe('the button that opens the image', () => {
  it('reads "Export", and is named "Export image" for a screen reader', () => {
    render(<ExportImageButton blocked={null} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Export image' });
    // What is seen is the one word, short enough to stay in the row of the Heat choice on a phone.
    expect(button).toHaveTextContent(/^Export$/);
    // Its name says what it exports, so it is not taken for the editor's Export tab, which exports
    // the layout as text, and still holds the word that is seen.
    expect(button.getAttribute('aria-label')).toContain(button.textContent);
  });

  it('says what the image holds, in its title, and opens it when pressed', async () => {
    const onClick = vi.fn();
    render(<ExportImageButton blocked={null} onClick={onClick} what="both layouts’ boards" />);
    const button = screen.getByRole('button', { name: 'Export image' });
    expect(button).toHaveAttribute(
      'title',
      'Make an image of both layouts’ boards, with its heat, Summary and credits, to post or share',
    );
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is off, with the reason as its title, until the numbers it draws are made', async () => {
    const onClick = vi.fn();
    render(<ExportImageButton blocked="Available once the layout is scored" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Export image' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Available once the layout is scored');
    expect(button).toHaveTextContent(/^Export$/);
  });
});
