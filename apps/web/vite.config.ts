import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { type Connect, defineConfig, loadEnv, type Plugin } from 'vite';
import { type AuthEnv, handleAuth } from './src/server/github-auth.js';

/**
 * Where the sign-in server is when it is not the page's own origin: the Worker on its own domain
 * (`worker/`). Read from the same place Vite reads the page's `import.meta.env`, so the policy and
 * the page cannot disagree. It becomes part of the policy, so it must be an https origin and nothing
 * more; unset (or empty, as an unset CI variable is) on the dev server, whose middleware below
 * answers on the page's own origin.
 */
function authOriginFrom(value: string | undefined): string {
  if (!value) return '';
  let origin: string | null = null;
  try {
    origin = new URL(value).origin;
  } catch {
    // Reported below.
  }
  if (origin !== value || !value.startsWith('https://')) {
    throw new Error(
      `VITE_AUTH_ORIGIN must be an https origin such as https://auth.example.com, not "${value}"`,
    );
  }
  return value;
}

/**
 * Everything the page is allowed to load. The bundle contains no inline script, no `eval` and no
 * `new Function`, and the analysis worker is a same-origin module, so `'self'` covers scripts;
 * inline styles are React writing heat colours and bar widths onto elements.
 *
 * `connect-src` is the one that matters: the GitHub access token and the session it is renewed
 * with are in this page, and this line is what stops any injected code from sending them anywhere
 * but the GitHub API and the sign-in server they came from.
 */
function contentSecurityPolicy(authOrigin: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "worker-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' https://api.github.com${authOrigin ? ` ${authOrigin}` : ''}`,
    "form-action 'none'",
  ].join('; ');
}

/**
 * What GitHub Pages needs to serve a single-page app, and what the page must say for itself.
 *
 * Pages sends no headers a site can choose, so the policy travels as a meta tag, written here so it
 * cannot drift from what the build checks. `frame-ancestors`, which a meta tag cannot carry, is the
 * check at the top of `main.tsx` instead. A deep link such as /analyze has no file behind it, so
 * Pages answers with `404.html`: a copy of the app, which reads the address and shows the view. The
 * status says 404; browsers do not mind.
 */
function staticHosting(policy: string): Plugin {
  return {
    name: 'static-hosting',
    apply: 'build',
    /**
     * `script-src 'self'` fails silently in the browser: the page just does not work. A dependency
     * that starts calling `eval`, or a plugin that inlines a script, would only show up in
     * production, so the build refuses to produce output the policy would block.
     */
    generateBundle(_options, bundle) {
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const offender = /(?<![.\w])eval\(|new Function\(/.exec(chunk.code);
        if (offender) {
          throw new Error(
            `${name} contains ${offender[0]}, which "script-src 'self'" blocks. ` +
              'Replace the dependency or relax the policy deliberately.',
          );
        }
      }
      const html = bundle['index.html'];
      if (html?.type === 'asset' && /<script(?![^>]*\bsrc=)/.test(String(html.source))) {
        throw new Error('index.html has an inline script, which "script-src \'self\'" blocks.');
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        ),
    },
    closeBundle() {
      const dir = resolve(import.meta.dirname, 'dist');
      copyFileSync(resolve(dir, 'index.html'), resolve(dir, '404.html'));
    },
  };
}

/** The landing page: static files, written by hand in `docs/site`, with no build of their own. */
const LANDING = resolve(import.meta.dirname, '../../docs/site');

const LANDING_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * The landing page, on the dev server only, at `/about/`: it is published on its own (see
 * `.github/workflows/pages.yml`), where the header's About link leads, and served here from
 * `docs/site` so it can be worked on beside the app its links open. Its paths are relative, so the
 * page must be asked for with the trailing slash; `/about` alone is sent there.
 */
function landingPage(): Plugin {
  return {
    name: 'landing-page',
    configureServer(server) {
      server.middlewares.use('/about', (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
        if (req.originalUrl?.split('?')[0] === '/about') {
          res.writeHead(301, { Location: '/about/' });
          res.end();
          return;
        }
        const file = resolve(LANDING, `.${path.endsWith('/') ? `${path}index.html` : path}`);
        if (!file.startsWith(`${LANDING}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', LANDING_TYPES[extname(file)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
  };
}

const AUTH_ENV_KEYS = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_APP_SLUG',
  'SESSION_SECRET',
  'UPSTREAM_REPO',
  'ALLOWED_ORIGINS',
] as const;

/**
 * Sign-in with GitHub on the dev and preview servers: the same handler the Worker runs in
 * production (`worker/auth.ts`), on the page's own origin, with its settings read from
 * `.env.local`. With none there, the app says sign-in is not set up, and works in the browser
 * alone as it does on any static host.
 */
function githubAuth(): Plugin {
  let env: AuthEnv = {};
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('error', next);
    req.on('end', () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const url = `http://${req.headers.host ?? 'localhost'}${req.originalUrl ?? req.url ?? '/'}`;
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
      handleAuth(new Request(url, { method: req.method, headers, body }), env)
        .then(async (response) => {
          res.statusCode = response.status;
          response.headers.forEach((value, name) => {
            res.setHeader(name, value);
          });
          res.end(new Uint8Array(await response.arrayBuffer()));
        })
        .catch(next);
    });
  };
  return {
    name: 'github-auth',
    configResolved(config) {
      const all = loadEnv(
        config.mode,
        typeof config.envDir === 'string' ? config.envDir : config.root,
        '',
      );
      env = Object.fromEntries(AUTH_ENV_KEYS.map((key) => [key, all[key]]));
    },
    configureServer(server) {
      server.middlewares.use('/api/auth', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/auth', middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const authOrigin = authOriginFrom(loadEnv(mode, import.meta.dirname, 'VITE_').VITE_AUTH_ORIGIN);
  return {
    // The app is served from the root of a domain of its own (layerbench.github.io), so the
    // default is what production uses; VITE_BASE exists for a copy served from a subdirectory,
    // such as a fork's GitHub Pages project site.
    base: process.env.VITE_BASE ?? '/',
    plugins: [
      react(),
      tailwindcss(),
      staticHosting(contentSecurityPolicy(authOrigin)),
      landingPage(),
      githubAuth(),
    ],
    worker: {
      format: 'es',
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
    server: {
      // The GitHub App's callback names this port; another one would send sign-in elsewhere.
      port: 4011,
      strictPort: true,
    },
  };
});
