import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Everything is bundled and served from our own origin — no CDN (docs/02 §7).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: process.env.SOURCEMAP === 'true', // off for public hosting (don't ship source); opt in with SOURCEMAP=true
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom', 'react-router'], charts: ['recharts'], query: ['@tanstack/react-query', '@tanstack/react-table'] },
      },
    },
  },
});
