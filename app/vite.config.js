import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// The corpus, thumbnails, frames and 21MB of map tiles are committed once, under
// prototype/public. Pointing publicDir there means the phone app serves the exact
// same bytes the web narrative does — one copy in the repo, no sync step, and the
// app still makes zero network calls at runtime.
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: resolve(__dirname, '../prototype/public'),
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
