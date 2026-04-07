/**
 * ICE Desktop — Electron Main Process
 *
 * Embeds the full web app + backend inside Electron.
 * The renderer loads from an embedded Express server (same gateway as production).
 * No separate IPC handlers — same code path as the web app.
 */

import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, cpSync } from 'fs';
import Module from 'module';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { app, BrowserWindow, shell, screen, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

// ─── Configuration ─────────────────────────────────────────────────────────

const GATEWAY_PORT = 15173; // Fixed local port for embedded gateway

// ─── Auto-Update ──────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  if (is.dev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', {
      status: 'available',
      version: info.version,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-status', {
      status: 'ready',
      version: info.version,
    });

    // Show a native dialog prompting restart
    dialog
      .showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: `ICE ${info.version} has been downloaded.`,
        detail: 'Restart now to apply the update?',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  autoUpdater.on('error', (err) => {
    // Silent — don't bother the user if update check fails
    if (is.dev) console.error('[updater]', err.message);
  });

  // Check for updates 5s after launch, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates(), 5_000);
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);

  // Allow renderer to trigger manual check
  ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates());
}

function getIconPath(): string | undefined {
  const iconName = process.platform === 'win32' ? 'icon.ico' : '512x512.png';
  const devPath = join(__dirname, '../../resources/icons', iconName);
  const prodPath = join(process.resourcesPath || __dirname, 'icons', iconName);
  const iconPath = is.dev ? devPath : prodPath;
  return existsSync(iconPath) ? iconPath : undefined;
}

// ─── Embedded Backend ──────────────────────────────────────────────────────

async function startEmbeddedBackend(): Promise<void> {
  const dbPath = join(app.getPath('userData'), 'ice-desktop.db');

  if (is.dev) {
    console.log('[desktop] ─── Starting Embedded Backend ───');
    console.log('[desktop] isDev:', is.dev);
    console.log('[desktop] userData:', app.getPath('userData'));
    console.log('[desktop] dbPath:', dbPath);
    console.log('[desktop] resourcesPath:', process.resourcesPath);
  }

  // Set environment for desktop mode
  process.env.ICE_DESKTOP = 'true';
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.JWT_SECRET = `desktop-${randomBytes(16).toString('hex')}`;
  process.env.CREDENTIAL_ENCRYPTION_KEY = `desktop-enc-${randomBytes(16).toString('hex')}`;
  process.env.FRONTEND_URL = `http://localhost:${GATEWAY_PORT}`;
  process.env.PORT = String(GATEWAY_PORT);
  process.env.NODE_ENV = 'production';

  // Tell the gateway where the web app static files are
  const webDistPath = is.dev
    ? join(__dirname, '../../../../packages/web/dist')
    : join(process.resourcesPath || __dirname, 'web-dist');
  process.env.ICE_WEB_DIST_PATH = webDistPath;

  // Patch module resolution so @prisma/client can find .prisma/client
  // The generated Prisma client is in extraResources/prisma-client
  if (!is.dev) {
    const prismaClientDir = join(process.resourcesPath || __dirname, 'prisma-client');

    // Copy to a location @prisma/client expects: node_modules/.prisma/client/
    const targetDir = join(app.getPath('userData'), 'node_modules', '.prisma', 'client');
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
      cpSync(prismaClientDir, targetDir, { recursive: true });
    }

    // Patch Node's module resolution to find .prisma/client in the userData path
    const origResolve = (Module as any)._resolveFilename;
    (Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
      if (request === '.prisma/client/default' || request === '.prisma/client') {
        const resolved = join(targetDir, request === '.prisma/client/default' ? 'default.js' : 'index.js');
        if (existsSync(resolved)) return resolved;
      }
      // When .prisma/client tries to require @prisma/client/*, resolve from the asar
      if (request.startsWith('@prisma/client') && parent?.filename?.includes('Application Support')) {
        const asarPath = join(app.getAppPath(), 'node_modules', request);
        if (existsSync(asarPath)) return asarPath;
        // Try with .js extension
        if (existsSync(asarPath + '.js')) return asarPath + '.js';
      }
      return origResolve.call(this, request, parent, ...args);
    };
  }

  if (!is.dev) {
    try {
      await import('@ice/gateway');
    } catch (err: any) {
      console.error('[desktop] Gateway start error:', err.message);
    }
  }
}

// ─── Window Management ─────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let splashShownAt = 0;
const MINIMUM_SPLASH_DURATION = 3000;

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const splashPath = is.dev ? join(__dirname, '../../src/main/splash.html') : join(__dirname, 'splash.html');

  if (existsSync(splashPath)) {
    splashWindow.loadFile(splashPath);
    splashWindow.once('ready-to-show', () => {
      splashShownAt = Date.now();
      splashWindow?.show();
    });
  }
}

function createMainWindow(): void {
  const display = screen.getPrimaryDisplay();
  const width = Math.min(2400, display.bounds.width);
  const height = Math.min(1600, display.bounds.height);
  const x = Math.round(display.bounds.x + (display.bounds.width - width) / 2);
  const y = Math.round(display.bounds.y + (display.bounds.height - height) / 2);

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    icon: getIconPath(),
    autoHideMenuBar: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 14 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show main window after splash minimum duration
  mainWindow.on('ready-to-show', () => {
    const remaining = Math.max(0, MINIMUM_SPLASH_DURATION - (Date.now() - splashShownAt));
    setTimeout(() => {
      splashWindow?.close();
      splashWindow = null;
      mainWindow?.show();
    }, remaining);
  });

  // Notify renderer of fullscreen changes (for traffic light padding)
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', false);
  });
  // Also handle maximize on macOS (traffic lights stay but move)
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('fullscreen-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('fullscreen-change', false);
  });

  // External links open in browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[desktop] Page failed to load:', { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[desktop] Page loaded:', mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['LOG', 'WARN', 'ERROR'];
    console.log(`[renderer ${levels[level] || level}] ${message} (${sourceId}:${line})`);
  });

  // Load the web app from the embedded gateway
  const appUrl = `http://localhost:${GATEWAY_PORT}`;
  console.log('[desktop] Loading URL:', is.dev ? 'http://localhost:5173' : appUrl);

  if (is.dev) {
    const webDevUrl = 'http://localhost:5173';
    mainWindow.loadURL(webDevUrl);
  } else {
    mainWindow.loadURL(appUrl);
  }
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ice.desktop');

  if (process.platform === 'darwin' && app.dock) {
    const icon = getIconPath();
    if (icon) app.dock.setIcon(icon);
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Show splash
  createSplashWindow();

  // Start embedded backend
  await startEmbeddedBackend();

  // Open main window
  createMainWindow();

  // Check for updates (production only)
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Security: prevent navigation
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://localhost:${GATEWAY_PORT}`)) {
      event.preventDefault();
    }
  });
});

export { mainWindow };
