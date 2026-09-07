import { copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Everything the page is allowed to load. The bundle contains no inline script, no `eval` and no
 * `new Function`, and the analysis worker is a same-origin module, so `'self'` covers scripts;
 * inline styles are React writing heat colours and bar widths onto elements.
 *
 * `connect-src` is the one that matters: the access token lives in this browser, and this line is
 * what stops any injected code from sending it anywhere but the GitHub API.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com",
  "form-action 'none'",
].join('; ');

/** `frame-ancestors` is ignored in a meta tag, so it is only set where real headers are available. */
const HEADERS = `/*
  Content-Security-Policy: ${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Cross-Origin-Opener-Policy: same-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/corpora/*
  Cache-Control: public, max-age=86400

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache
`;

/** Anything with no file behind it is a client route, and the app resolves it. */
const REDIRECTS = '/*  /index.html  200\n';

/**
 * Files a static host needs to serve a single-page app correctly.
 *
 * Cloudflare Pages reads `_redirects` and `_headers` from the output root; without the rewrite it
 * would answer a deep link such as /edit with `404.html` and a 404 status. GitHub Pages ignores
 * both files and uses `404.html` instead, so shipping all three keeps either host working.
 *
 * The policy is written here rather than in `public/` so the meta tag and the header cannot drift.
 */
function staticHosting(): Plugin {
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
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
        ),
    },
    closeBundle() {
      const dir = resolve(import.meta.dirname, 'dist');
      copyFileSync(resolve(dir, 'index.html'), resolve(dir, '404.html'));
      writeFileSync(resolve(dir, '_headers'), HEADERS);
      writeFileSync(resolve(dir, '_redirects'), REDIRECTS);
    },
  };
}

export default defineConfig({
  // Cloudflare Pages serves from the root of a domain, so the default is what production uses;
  // VITE_BASE exists for hosts that serve the site from a subdirectory, such as GitHub Pages.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), staticHosting()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
