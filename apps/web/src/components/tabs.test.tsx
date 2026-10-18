import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs, tabPanelId } from './Tabs.js';

const TABS = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
  { id: 'three', label: 'Three' },
] as const;

function Row() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('one');
  return (
    <>
      <button type="button">Before</button>
      <Tabs label="Pages" prefix="pages" tabs={TABS} value={tab} onChange={setTab} />
      <div role="tabpanel" id={tabPanelId('pages', tab)}>
        {tab}
      </div>
    </>
  );
}

const selected = () => screen.getByRole('tab', { selected: true });

describe('a row of tabs', () => {
  it('is one stop for Tab, on the selected tab', async () => {
    const user = userEvent.setup();
    render(<Row />);
    await user.click(screen.getByRole('button', { name: 'Before' }));
    await user.tab();
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it('moves with the arrow keys, round from either end, and Home and End', async () => {
    const user = userEvent.setup();
    render(<Row />);
    await user.click(screen.getByRole('tab', { name: 'One' }));
    await user.keyboard('{ArrowRight}');
    expect(selected()).toHaveAccessibleName('Two');
    expect(selected()).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('two');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(selected()).toHaveAccessibleName('One');
    await user.keyboard('{ArrowLeft}');
    expect(selected()).toHaveAccessibleName('Three');
    expect(selected()).toHaveFocus();
    await user.keyboard('{Home}');
    expect(selected()).toHaveAccessibleName('One');
    await user.keyboard('{End}');
    expect(selected()).toHaveAccessibleName('Three');
    // Any other key is left to the page.
    await user.keyboard('{ArrowDown}');
    expect(selected()).toHaveAccessibleName('Three');
  });

  it('says which panel each tab shows', () => {
    render(<Row />);
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute(
      'aria-controls',
      'pages-panel-two',
    );
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '-1');
  });
});
