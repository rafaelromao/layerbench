import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PULL_SCOPES, PULL_TYPES } from './pr-title.js';

// The rule's lists are in four places that must not drift: here, the changelog's sections in
// Release Please's config, the tables of CONTRIBUTING.md, and the version every package carries.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');
const json = (path: string) => JSON.parse(read(path)) as Record<string, unknown>;

interface Package {
  'release-type': string;
  'include-component-in-tag': boolean;
  'changelog-type'?: string;
  'bump-minor-pre-major'?: boolean;
  'release-as'?: string;
  'changelog-sections': { type: string; section: string; hidden?: boolean }[];
  'extra-files': { type: string; path: string; jsonpath: string }[];
}
const config = json('release-please-config.json') as {
  'bootstrap-sha': string;
  packages: Record<string, Package>;
};
const manifest = json('.release-please-manifest.json') as Record<string, string>;

describe('the convention and Release Please', () => {
  const root = config.packages['.'];

  it('is one package: the whole repository has one version', () => {
    expect(Object.keys(config.packages)).toEqual(['.']);
    expect(Object.keys(manifest)).toEqual(['.']);
    expect(root['release-type']).toBe('node');
    // The release pull request's title is `chore(main): release X.Y.Z`, which `pr-title.ts` accepts
    // as it is; a component in it would change it.
    expect(root['include-component-in-tag']).toBe(false);
    expect(config['bootstrap-sha']).toMatch(/^[0-9a-f]{40}$/);
  });

  it('lists in the changelog exactly the types a title may have', () => {
    const types = root['changelog-sections'].map((s) => s.type);
    expect([...types].sort()).toEqual([...PULL_TYPES].sort());
  });

  it('lists a feature, a fix, a performance gain and a revert, and hides the rest', () => {
    const shown = root['changelog-sections'].filter((s) => !s.hidden).map((s) => s.type);
    expect(shown.sort()).toEqual(['feat', 'fix', 'perf', 'revert']);
  });

  it('generates release notes from merged pull requests without pinning the next version', () => {
    expect(root['changelog-type']).toBe('github');
    expect(root['release-as']).toBeUndefined();
    expect(root['bump-minor-pre-major']).toBe(true);
    expect(manifest['.']).toBe('0.2.0');
  });

  it("gives every type and every scope a row in CONTRIBUTING.md's tables", () => {
    const doc = read('CONTRIBUTING.md');
    for (const word of [...PULL_TYPES, ...PULL_SCOPES]) {
      expect(doc, `CONTRIBUTING.md has no table row for \`${word}\``).toContain(`| \`${word}\` |`);
    }
  });

  it('sets the version of every package, and each is at the manifest', () => {
    const packages = ['packages', 'apps'].flatMap((dir) =>
      readdirSync(`${ROOT}${dir}`, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `${dir}/${e.name}/package.json`),
    );
    const set = root['extra-files'].map((f) => f.path);
    expect([...set].sort()).toEqual(packages.sort());
    for (const file of root['extra-files']) expect(file.jsonpath).toBe('$.version');
    for (const path of ['package.json', ...set]) {
      expect(json(path).version, `${path} is not at the manifest's version`).toBe(manifest['.']);
    }
  });
});
