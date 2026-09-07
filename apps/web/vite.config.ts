import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * GitHub Pages serves `404.html` for any path it does not recognise. Shipping a copy of the app
 * there is what makes a deep link such as /edit work on a first visit.
 */
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    apply: 'build',
    closeBundle() {
      const dir = resolve(import.meta.dirname, 'dist');
      copyFileSync(resolve(dir, 'index.html'), resolve(dir, '404.html'));
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), spaFallback()],
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
