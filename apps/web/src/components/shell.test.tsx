import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useGitHubSession } from '../auth/github-session.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { LIBRARY, renderRoute, testClient } from '../test/render.js';

let counter = 0;

function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layerbench-shell-${++counter}`);
}

afterEach(() => {
  useGitHubSession.setState({ status: 'unknown', login: null, target: null, targetStatus: 'idle' });
});

describe('where the site opens', () => {
  it('opens on the Library, and so does the title', async () => {
    const user = userEvent.setup();
    const { currentPath } = renderRoute('/', { storage: freshStorage() });
    expect(await screen.findByRole('heading', { name: 'Layouts' })).toBeInTheDocument();
    expect(currentPath()).toBe('/library');

    await user.click(screen.getAllByRole('link', { name: 'Compare' })[0]);
    await waitFor(() => expect(currentPath()).toBe('/compare'));
    await user.click(screen.getByRole('link', { name: 'LayerBench' }));
    await waitFor(() => expect(currentPath()).toBe('/library'));
  });

  it('keeps the corpus, the rules and the features chosen in one view in the next', async () => {
    const user = userEvent.setup();
    const { currentPath, currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    await user.click(await screen.findByRole('button', { name: 'Rank and filter' }));
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

  it('opens storage settings as a dialog that offers to sign in with GitHub', async () => {
    useGitHubSession.setState({ status: 'signed-out', login: null, target: null });
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(await screen.findByRole('button', { name: /^Storage/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Storage' });
    expect(within(dialog).getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
    expect(within(dialog).queryByLabelText('Access token')).toBeNull();
  });

  it('says where a signed-in user’s documents go, and how to save them to a fork instead', async () => {
    useGitHubSession.setState({
      status: 'signed-in',
      login: 'you',
      appSlug: 'layerbench-app',
      upstream: 'rafaelromao/layerbench',
      target: { kind: 'gist', forkWithoutAccess: 'you/layerbench' },
      targetStatus: 'idle',
    });
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(
      await screen.findByRole('button', { name: 'Storage: this browser and GitHub (@you)' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Storage' });
    expect(within(dialog).getByText(/Signed in as/)).toHaveTextContent('Signed in as @you');
    expect(within(dialog).getByRole('link', { name: 'gists in your account' })).toHaveAttribute(
      'href',
      'https://gist.github.com/you',
    );
    expect(
      within(dialog).getByRole('link', { name: 'Give LayerBench access to it' }),
    ).toHaveAttribute('href', 'https://github.com/apps/layerbench-app/installations/new');
    expect(within(dialog).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('still offers to give the app a fork when GitHub could not be asked where to save', async () => {
    useGitHubSession.setState({
      status: 'signed-in',
      login: 'you',
      appSlug: 'layerbench-app',
      upstream: 'rafaelromao/layerbench',
      target: null,
      targetStatus: 'error',
    });
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(await screen.findByRole('button', { name: /^Storage/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Storage' });
    expect(within(dialog).getByText(/could not be asked where to save/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Give LayerBench access to it' }),
    ).toBeInTheDocument();
  });

  it('names the fork and its branch when documents go there', async () => {
    useGitHubSession.setState({
      status: 'signed-in',
      login: 'you',
      target: {
        kind: 'repo',
        repo: 'you/layerbench',
        branch: 'layerbench-data',
        path: 'data',
        upstream: false,
      },
      targetStatus: 'idle',
    });
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(await screen.findByRole('button', { name: /^Storage/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Storage' });
    expect(within(dialog).getByRole('link', { name: 'you/layerbench' })).toHaveAttribute(
      'href',
      'https://github.com/you/layerbench/tree/layerbench-data/data',
    );
    expect(within(dialog).queryByRole('link', { name: /Give LayerBench access/ })).toBeNull();
  });

  it('says so where sign-in is not set up', async () => {
    useGitHubSession.setState({ status: 'unavailable', login: null, target: null });
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(await screen.findByRole('button', { name: 'Storage: this browser only' }));
    const dialog = await screen.findByRole('dialog', { name: 'Storage' });
    expect(
      within(dialog).getByText(/not set up where this copy of the app runs/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Sign in with GitHub' })).toBeNull();
  });
});

describe('Editing, in Analyze', () => {
  it('has no view of its own in the header', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Analyze' })).toBeInTheDocument();
  });
});
