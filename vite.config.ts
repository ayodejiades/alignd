import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'web',
  base: '/alignd/',
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'web/index.html'),
        print: resolve(__dirname, 'web/print.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
});
