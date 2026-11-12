import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import staticRoutes from '../static-routes.json' with { type: 'json' };

const dist = resolve(import.meta.dirname, '../dist');
const shell = readFileSync(resolve(dist, 'index.html'), 'utf8');
const addressFor = (pathname) => {
  const route = pathname === '/' ? '' : pathname.slice(1);
  return resolve(dist, route, 'index.html');
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const file = addressFor(url.pathname);
  if (!existsSync(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(readFileSync(file));
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
try {
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  for (const route of staticRoutes) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, `${route} should serve a successful app entry document`);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await response.text(), shell, `${route} should expose the generic app metadata`);
  }

  const analysis = await fetch(`${origin}/analyze?layout=magic-romak`);
  assert.equal(analysis.status, 200, 'shared analysis URLs should serve a successful response');
  assert.match(await analysis.text(), /property="og:title"/);
} finally {
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
}
