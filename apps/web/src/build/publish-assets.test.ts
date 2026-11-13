import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let temp = '';

afterEach(() => {
  if (temp) rmSync(temp, { recursive: true, force: true });
  temp = '';
});

describe('deployment assets', () => {
  it('publishes current and previous bundles, pruning only older assets', () => {
    temp = mkdtempSync(join(process.cwd(), '.tmp-deploy-'));
    const repository = resolve('../..');
    const workspace = join(temp, 'workspace');
    const source = join(workspace, 'dist');
    const site = join(workspace, 'site');
    const assets = join(site, 'assets');
    const scripts = join(workspace, 'apps/web/scripts');
    mkdirSync(join(source, 'assets'), { recursive: true });
    mkdirSync(assets, { recursive: true });
    mkdirSync(scripts, { recursive: true });
    mkdirSync(join(site, '.git'));
    copyFileSync(
      join(repository, 'apps/web/scripts/publish-assets.mjs'),
      join(scripts, 'publish-assets.mjs'),
    );

    writeFileSync(join(source, 'index.html'), 'new index');
    writeFileSync(join(source, 'assets', 'current.js'), 'new bundle');
    writeFileSync(join(assets, 'previous.js'), 'previous bundle');
    writeFileSync(join(assets, 'older.js'), 'older bundle');
    writeFileSync(join(site, '.assets'), 'assets/previous.js\n');
    writeFileSync(join(site, '.git', 'keep'), 'repository');
    writeFileSync(join(site, 'stale.html'), 'stale root file');

    execFileSync(process.execPath, ['apps/web/scripts/publish-assets.mjs', 'dist', 'site'], {
      cwd: workspace,
    });

    expect(readFileSync(join(site, 'index.html'), 'utf8')).toBe('new index');
    expect(readFileSync(join(assets, 'current.js'), 'utf8')).toBe('new bundle');
    expect(readFileSync(join(assets, 'previous.js'), 'utf8')).toBe('previous bundle');
    expect(() => readFileSync(join(assets, 'older.js'))).toThrow();
    expect(readFileSync(join(site, '.assets'), 'utf8')).toBe('assets/current.js\n');
    expect(readFileSync(join(site, '.git', 'keep'), 'utf8')).toBe('repository');
    expect(() => readFileSync(join(site, 'stale.html'))).toThrow();
    expect(readFileSync(join(site, '.nojekyll'), 'utf8')).toBe('');
  });

  it('checks out the publisher before downloading and publishing the deploy artifact', () => {
    const repository = resolve('../..');
    const workflow = readFileSync(join(repository, '.github/workflows/ci.yml'), 'utf8');
    const deployStart = workflow.indexOf('\n  deploy:\n');
    const deployEnd = workflow.indexOf('\n  community-cleanup:\n', deployStart);
    const deploy = workflow.slice(deployStart, deployEnd);
    const sourceCheckout = deploy.indexOf(`ref: \${{ github.sha }}`);
    const artifactDownload = deploy.indexOf('actions/download-artifact@');
    const siteCheckout = deploy.indexOf('path: site');
    const publisher = deploy.indexOf('node apps/web/scripts/publish-assets.mjs dist site');

    expect(sourceCheckout).toBeGreaterThanOrEqual(0);
    expect(artifactDownload).toBeGreaterThan(sourceCheckout);
    expect(siteCheckout).toBeGreaterThan(artifactDownload);
    expect(publisher).toBeGreaterThan(siteCheckout);
  });
});
