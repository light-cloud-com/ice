import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
const buildId = randomBytes(8).toString('hex');

export default defineConfig({
  plugins: [react()],
  define: {
    __ICE_VERSION__: JSON.stringify(pkg.version),
    __ICE_BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@ui': resolve(__dirname, '../ui/src'),
    },
  },
  server: {
    port: 5173,
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 5002}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${process.env.PORT || 5002}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${buildId}-[hash].js`,
        chunkFileNames: `assets/[name]-${buildId}-[hash].js`,
        assetFileNames: `assets/[name]-${buildId}-[hash].[ext]`,
      },
    },
  },
});
