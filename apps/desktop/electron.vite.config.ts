import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Copy splash screen to dist
function copySplashPlugin() {
  return {
    name: 'copy-splash',
    closeBundle() {
      const distMain = resolve(__dirname, 'dist/main');
      if (!existsSync(distMain)) mkdirSync(distMain, { recursive: true });
      const src = resolve(__dirname, 'src/main/splash.html');
      if (existsSync(src)) copyFileSync(src, resolve(distMain, 'splash.html'));
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copySplashPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      // Output CJS format — Electron's sandbox doesn't support ESM in preload
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  // No renderer build needed — web app is served by the embedded Express gateway
  renderer: {},
});
