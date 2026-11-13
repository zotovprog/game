import { defineConfig } from 'vite';

// base './' — сборка открывается из любой папки (GitHub Pages, artifact, локально)
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  server: { host: true },
});
