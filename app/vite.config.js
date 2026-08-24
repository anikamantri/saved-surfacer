import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The corpus, thumbnails, frames and ~4k map tiles live in public/ and are
// committed. That is what lets the app run with zero network calls at runtime
// and with no API keys — the map works on a plane.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
