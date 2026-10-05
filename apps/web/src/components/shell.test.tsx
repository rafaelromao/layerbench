import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { LIBRARY, renderRoute, testClient } from '../test/render.js';

let counter = 0;

function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layoutmaster-shell-${++counter}`);
}

describe('where the site opens', () => {
  it('opens on the Library, and so does the title', async () => {
    const user = userEvent.setup();
    const { currentPath } = renderRoute('/', { storage: freshStorage() });
    expect(await screen.findByRole('heading', { name: 'Layouts' })).toBeInTheDocument();
    expect(currentPath()).toBe('/library');

    await user.click(screen.getAllByRole('link', { name: 'Compare' })[0]);
    await waitFor(() => expect(currentPath()).toBe('/compare'));
    await user.click(screen.getByRole('link', { name: 'LayoutMaster' }));
    await waitFor(() => expect(currentPath()).toBe('/library'));
  });

  it('still opens the analysis an older link names, on the corpus that replaced its own', async () => {
    const { currentPath, currentSearch } = renderRoute(
      '/?corpus=en-work&layout=qwerty&sample=1000',
      {
        storage: freshStorage(),
      },
    );
    expect(await screen.findByLabelText('How is this typed?')).toBeInTheDocument();
    expect(currentPath()).toBe('/analyze');
    expect(currentSearch()).toContain('layout=qwerty');
    // The Romak work corpus is gone; its English replacement opens instead.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Corpus' })).toHaveValue('en-conv'),
    );
  });
});

describe('moving between views', () => {
  it('keeps the corpus, the rules and the features chosen in one view in the next', async () => {
    const user = userEvent.setup();
    const { currentPath, currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    const corpus = await screen.findByRole('combobox', { name: 'Corpus' });
    await waitFor(() => expect(within(corpus).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(corpus, 'en-conv');
    await waitFor(() => expect(currentSearch()).toContain('corpus=en-conv'));

    const nav = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('link', { name: 'Analyze' }));
    await waitFor(() => expect(currentPath()).toBe('/analyze'));
    expect(currentSearch()).toContain('corpus=en-conv');
    expect(currentSearch()).toContain('sample=1000');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Corpus' })).toHaveValue('en-conv'),
    );

    // A feature switched off here is off in Compare too.
    await user.click(
      within(screen.getByRole('group', { name: 'Analyze with' })).getByRole('checkbox', {
        name: 'Repeat key',
      }),
    );
    await waitFor(() => expect(currentSearch()).toContain('off=repeat'));
    await user.click(within(nav).getByRole('link', { name: 'Compare' }));
    await waitFor(() => expect(currentPath()).toBe('/compare'));
    expect(currentSearch()).toContain('corpus=en-conv');
    expect(
      within(screen.getByRole('group', { name: 'Compare with' })).getByRole('checkbox', {
        name: 'Repeat key',
      }),
    ).not.toBeChecked();

    // A view that does not analyze opens as it is, and leaving it keeps the choices.
    await user.click(within(nav).getByRole('link', { name: 'Rules' }));
    await waitFor(() => expect(currentPath()).toBe('/rules'));
    expect(currentSearch()).not.toContain('corpus=');
    await user.click(within(nav).getByRole('link', { name: 'Library' }));
    await waitFor(() => expect(currentPath()).toBe('/library'));
    expect(currentSearch()).toContain('corpus=en-conv');
    expect(currentSearch()).toContain('off=repeat');
  }, 60_000);
});

describe('while data loads', () => {
  it('shows a bar under the header until the engine has answered', async () => {
    const real = testClient();
    let release: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The corpus list arrives only when the test says so, as over a slow network.
    const client = new Proxy(real, {
      get(target, prop) {
        if (prop === 'listCorpora') return () => waiting.then(() => target.listCorpora());
        const member = Reflect.get(target, prop);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
    renderRoute('/corpus', { client, storage: freshStorage() });

    expect(await screen.findByRole('progressbar', { name: 'Loading data' })).toBeInTheDocument();
    release();
    await waitFor(
      () => expect(screen.queryByRole('progressbar', { name: 'Loading data' })).toBeNull(),
      {
        timeout: 20_000,
      },
    );
  }, 30_000);
});

describe('the page frame', () => {
  it('links to the About page, which is served beside the app rather than routed', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name: 'Layouts' });
    // One in the header at a desk, one in the phone's menu.
    const about = screen.getAllByRole('link', { name: 'About' });
    expect(about).toHaveLength(2);
    for (const link of about) expect(link).toHaveAttribute('href', '/about/');
  });

  it('offers a skip link to the content', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    const skip = await screen.findByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')).toBeInTheDocument();
  });

  it('moves focus into the new view when the route changes', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name: 'Layouts' });

    // The first render must not steal focus from wherever the browser put it.
    expect(document.activeElement).toBe(document.body);

    await user.click(screen.getAllByRole('link', { name: 'Compare' })[0]);

    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('main'));
    });
  });

  it('names the storage state without relying on the tick alone', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(
      await screen.findByRole('button', { name: 'Storage: this browser only' }),
    ).toBeInTheDocument();
  });

  it('closes the narrow-screen menu once a view is chosen, on a tap elsewhere and on Escape', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name: 'Layouts' });
    const summary = screen.getByText('Menu', { selector: 'summary' });
    const menu = summary.closest('details') as HTMLDetailsElement;

    await user.click(summary);
    expect(menu.open).toBe(true);
    await user.click(within(menu).getByRole('link', { name: 'Compare' }));
    await waitFor(() => expect(menu.open).toBe(false));

    await user.click(summary);
    expect(menu.open).toBe(true);
    await user.click(document.getElementById('main') as HTMLElement);
    expect(menu.open).toBe(false);

    await user.click(summary);
    await user.keyboard('{Escape}');
    expect(menu.open).toBe(false);
  });

  it('opens storage settings as a dialog with a name and a token field that hides itself', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(await screen.findByRole('button', { name: /^Storage/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Storage' });
    const token = screen.getByLabelText('Access token');
    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAttribute('autocomplete', 'off');
    // Nothing to connect to yet, so neither remote action is offered.
    expect(within(dialog).getByRole('button', { name: 'Test connection' })).toBeDisabled();
  });
});

describe('Edit, joined into Analyze', () => {
  it('has no view of its own in the header', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Analyze' })).toBeInTheDocument();
  });

  it('opens an old link to the editor in Analyze, on English news unless it names a text', async () => {
    const plain = renderRoute('/edit?layout=qwerty&sample=1000', { storage: freshStorage() });
    await waitFor(() => expect(plain.currentPath()).toBe('/analyze'));
    expect(plain.currentSearch()).toContain('layout=qwerty');
    expect(plain.currentSearch()).toContain('corpus=en-general');
    plain.unmount();

    const named = renderRoute('/edit?layout=qwerty&corpus=pt-br-conv&sample=1000', {
      storage: freshStorage(),
    });
    await waitFor(() => expect(named.currentPath()).toBe('/analyze'));
    expect(named.currentSearch()).toContain('corpus=pt-br-conv');
  });
});
