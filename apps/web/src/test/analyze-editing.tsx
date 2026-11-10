// The helpers the analyze-editing-*.test.tsx files share: opening Analyze on a layout, the dialogs
// and keys of its editor, and the servers it talks to, stood in for.
import {
  accentsCombo,
  bundledLayout,
  getGeometryPreset,
  type Layout,
  toCanonicalJson,
} from '@layerbench/core';
import { screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { expect, vi } from 'vitest';
import { initGitHubSession } from '../auth/github-session.js';
import type { AnalysisClient, AnalyzeRequest } from '../engine/protocol.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { decodeInline } from '../url/inline.js';
import { newLayout } from '../views/new-layout.js';
import { keyNamed } from './keys.js';
import { renderRoute, testClient } from './render.js';

let counter = 0;
export const freshStorage = () => new IndexedDbAdapter(`layerbench-edit-${++counter}`);

/** Drag one key onto another, the way a pointer does it. */
export async function dragKey(
  from: string,
  to: string,
  options: { altKey?: boolean } = {},
): Promise<void> {
  const svg = document.getElementById('kb-analyze') as unknown as SVGSVGElement;
  const source = svg.querySelector(`g[data-key="${from}"]`) as Element;
  const target = svg.querySelector(`g[data-key="${to}"]`) as Element;
  const { altKey = false } = options;

  // jsdom has no layout, so hit testing has to be told what is under the pointer.
  const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockImplementation(() => target);

  svg.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }) as Event &
      PointerEvent,
  );
  source.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }) as Event &
      PointerEvent,
  );
  svg.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: 20, clientY: 20, altKey }) as Event &
      PointerEvent,
  );
  svg.dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, clientX: 20, clientY: 20, altKey }) as Event &
      PointerEvent,
  );
  elementFromPoint.mockRestore();
}

/** Open Analyze on Qwerty, in `storage`, and wait for its first analysis. */
export async function openEditOn(storage: IndexedDbAdapter): Promise<void> {
  renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', { storage });
  await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
}

/** Open Analyze on Qwerty and wait for its first analysis. */
export async function openEdit(): Promise<void> {
  await openEditOn(freshStorage());
}

/**
 * Qwerty as a user makes it: **New layout** from Qwerty, with the default layers. The bundled one
 * is its author's, with no layer past its base.
 */
export const qwertyWithDefaults = (): Layout =>
  newLayout({ name: 'Qwerty', geometry: '3x5+2', start: 'qwerty', defaultLayers: true });

/** Open Analyze on that Qwerty, saved as a custom layout, and wait for its first analysis. */
export async function openEditWithDefaults(): Promise<void> {
  const storage = freshStorage();
  await seed(storage, qwertyWithDefaults(), 'qwerty-defaults', {});
  renderRoute('/analyze?layout=custom%3Aqwerty-defaults&corpus=en-general&sample=20000', {
    storage,
  });
  await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
}

/**
 * Open Analyze on a copy of Qwerty that reaches Accents by LHR and LHM pressed together, a combo on
 * two finger keys for the combo editor to work on, and wait for its first analysis.
 */
export async function openComboEdit(): Promise<void> {
  const storage = freshStorage();
  await seed(storage, qwertyWithDefaults(), 'qwerty-combo', {
    combos: [{ ...accentsCombo('base', getGeometryPreset('3x5+2')), keys: ['LHR', 'LHM'] }],
  });
  renderRoute('/analyze?layout=custom%3Aqwerty-combo&corpus=en-general&sample=20000', { storage });
  await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
}

export const key = (name: string) => screen.getByRole('button', { name: keyNamed(name) });

/** A key of the board being edited, as the pointer meets it. */
export const svgKey = (keyId: string) =>
  document.querySelector(`#kb-analyze g[data-key="${keyId}"]`) as Element;

/** A finger touching or lifting, where it went down. */
export const touchEvent = (type: 'pointerdown' | 'pointerup') =>
  new PointerEvent(type, {
    bubbles: true,
    clientX: 1,
    clientY: 1,
    pointerType: 'touch',
  }) as Event & PointerEvent;

/** The bar above the board: the layout's name, author and description, Save, corpus and rules. */
export const bar = () => screen.getByRole('region', { name: 'Layout' });

/** The dialog Save opens for a layout that is not yours, asking what to call the copy. */
export const copyDialog = () => screen.getByRole('dialog', { name: 'Save a copy' });

/**
 * Save on a bundled or community layout asks first whether to propose the change or save a copy:
 * this answers Save a copy.
 */
export async function toCopy(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const choice = await screen.findByRole('dialog', { name: /^Save / });
  await user.click(within(choice).getByRole('button', { name: 'Save a copy' }));
}

/** Save a layout that is not yours: answer the dialog, with `name` if one is to be given. */
export async function saveCopy(
  user: ReturnType<typeof userEvent.setup>,
  name?: string,
): Promise<void> {
  await user.click(within(bar()).getByRole('button', { name: 'Save' }));
  await toCopy(user);
  const dialog = copyDialog();
  if (name !== undefined) {
    const field = within(dialog).getByLabelText('Name of the copy');
    await user.clear(field);
    await user.type(field, name);
  }
  await user.click(within(dialog).getByRole('button', { name: 'Save copy' }));
}

export const PULL = 'https://github.com/rafaelromao/layerbench/pull/100';

/**
 * The sign-in server and GitHub, stood in for: each change proposed is kept and answered with
 * `PULL`, but for the first `failures`, which GitHub could not be reached for, or with `refusal`,
 * which the server refuses each for; its state on GitHub is `pull.state`. Signed in as `you`.
 */
export async function proposing(
  failures = 0,
  refusal?: string,
): Promise<{
  sent: Record<string, unknown>[];
  pull: { state: 'open' | 'closed' };
}> {
  const sent: Record<string, unknown>[] = [];
  const pull = { state: 'open' as 'open' | 'closed' };
  const real = globalThis.fetch;
  localStorage.setItem('layerbench:github-session', 'sealed');
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/auth/propose')) {
      sent.push(JSON.parse(String(init?.body)));
      if (sent.length <= failures) return reply({ error: 'GitHub could not be reached' }, 502);
      if (refusal) return reply({ error: 'not accepted', reason: refusal }, 422);
      return reply({ url: PULL }, 201);
    }
    if (url.includes('/api/auth/')) {
      return reply({
        available: true,
        clientId: 'Iv1.client',
        signedIn: true,
        login: 'you',
        token: 'ghu_one',
        expiresAt: Date.now() + 3600_000,
      });
    }
    if (url === 'https://api.github.com/repos/rafaelromao/layerbench/pulls/100') {
      return reply({ state: pull.state, merged: false });
    }
    return real(input, init);
  });
  await initGitHubSession();
  return { sent, pull };
}

/** The engine, keeping every analysis it is asked for. */
export function recording(): { client: AnalysisClient; requests: AnalyzeRequest[] } {
  const real = testClient();
  const requests: AnalyzeRequest[] = [];
  const client = new Proxy(real, {
    get(target, prop) {
      if (prop === 'analyze') {
        return (...args: Parameters<AnalysisClient['analyze']>) => {
          requests.push(args[0]);
          return target.analyze(...args);
        };
      }
      const member = Reflect.get(target, prop);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
  return { client, requests };
}

/** A custom copy of a bundled layout, or a layout given, under its own id and name. */
export async function seed(
  storage: IndexedDbAdapter,
  from: string | Layout,
  id: string,
  extra: Partial<Layout>,
) {
  const layout = typeof from === 'string' ? (bundledLayout(from) as Layout) : from;
  await storage.put('layouts', id, toCanonicalJson({ ...layout, id, ...extra }), {
    message: 'seed',
  });
}

/** The layout a link carries whole, read back; a custom layout's link carries it so. */
export async function carried(search: string): Promise<Layout | null> {
  const ref = new URLSearchParams(search).get('layout') ?? '';
  if (!ref.startsWith('inline:')) return null;
  const decoded = await decodeInline(ref.slice('inline:'.length));
  return decoded.ok ? decoded.layout : null;
}

/** The link a custom layout opened by its id ends up with: the layout itself. */
export async function linkOf(currentSearch: () => string, id: string): Promise<string> {
  await waitFor(async () => expect((await carried(currentSearch()))?.id).toBe(id));
  return currentSearch();
}

/** The inspector for one key, which is where every edit to it is made. */
export const inspector = (keyId: string) => screen.findByRole('group', { name: `Edit ${keyId}` });

export async function openMagicRomak(): Promise<void> {
  renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000', {
    storage: freshStorage(),
  });
  await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
}
