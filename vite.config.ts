import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // relative base so the built app can be opened from any path (mobile / PWA / file server)
  base: './',
  server: {
    host: true,
    port: 5180,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
