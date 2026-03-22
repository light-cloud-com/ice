import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Plugin to copy splash screen files
function copySplashPlugin() {
  return {
    name: 'copy-splash',
    closeBundle() {
      const distMain = resolve(__dirname, 'dist/main');
      const distResources = resolve(__dirname, 'dist/resources');

      // Ensure directories exist
      if (!existsSync(distMain)) mkdirSync(distMain, { recursive: true });
      if (!existsSync(distResources)) mkdirSync(distResources, { recursive: true });

      // Copy splash.html
      const splashSrc = resolve(__dirname, 'src/main/splash.html');
      const splashDest = resolve(distMain, 'splash.html');
      if (existsSync(splashSrc)) {
        copyFileSync(splashSrc, splashDest);
      }

      // Copy logo files
      const logoDarkSrc = resolve(__dirname, 'resources/logo-dark.png');
      const logoDarkDest = resolve(distResources, 'logo-dark.png');
      if (existsSync(logoDarkSrc)) {
        copyFileSync(logoDarkSrc, logoDarkDest);
      }

      const logoLightSrc = resolve(__dirname, 'resources/logo-light.png');
      const logoLightDest = resolve(distResources, 'logo-light.png');
      if (existsSync(logoLightSrc)) {
        copyFileSync(logoLightSrc, logoLightDest);
      }
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copySplashPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});
