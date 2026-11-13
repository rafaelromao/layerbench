import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

function filesUnder(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function copyContents(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source)) {
    cpSync(join(source, name), join(destination, name), { recursive: true, force: true });
  }
}

/** Publish a built site, retaining assets referenced by this and the immediately preceding build. */
export function publishAssets(source, site) {
  const previous = new Set(
    existsSync(join(site, '.assets'))
      ? readFileSync(join(site, '.assets'), 'utf8').split(/\r?\n/).filter(Boolean)
      : [],
  );
  const current = new Set(
    filesUnder(join(source, 'assets')).map((file) => relative(source, file).split(sep).join('/')),
  );

  mkdirSync(site, { recursive: true });
  const assets = join(site, 'assets');
  for (const file of filesUnder(assets)) {
    const name = relative(site, file).split(sep).join('/');
    if (!current.has(name) && !previous.has(name)) rmSync(file);
  }

  for (const name of readdirSync(site)) {
    if (name === '.git' || name === '.assets' || name === 'assets') continue;
    rmSync(join(site, name), { recursive: true, force: true });
  }

  copyContents(source, site);
  writeFileSync(join(site, '.assets'), [...current].sort().join('\n') + (current.size ? '\n' : ''));
  writeFileSync(join(site, '.nojekyll'), '');
}

const [source, site, ...extra] = process.argv.slice(2);
if (!source || !site || extra.length > 0) {
  throw new Error('Usage: node publish-assets.mjs <built-site> <pages-repository>');
}
publishAssets(resolve(source), resolve(site));
