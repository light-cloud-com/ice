/**
 * ICE Desktop — Electron Main Process
 *
 * Embeds the full web app + backend inside Electron.
 * The renderer loads from an embedded Express server (same gateway as production).
 * No separate IPC handlers — same code path as the web app.
 */

import { app, BrowserWindow, shell, screen, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';

// ─── Configuration ─────────────────────────────────────────────────────────

const GATEWAY_PORT = 15173; // Fixed local port for embedded gateway

function getIconPath(): string {
  const iconName = process.platform === 'win32' ? 'icon.ico' : '512x512.png';
  if (is.dev) return join(__dirname, '../../resources/icons', iconName);
  return join(process.resourcesPath || __dirname, 'icons', iconName);
}

// ─── Embedded Backend ──────────────────────────────────────────────────────

async function startEmbeddedBackend(): Promise<void> {
  const dbPath = join(app.getPath('userData'), 'ice-desktop.db');

  // Set environment for desktop mode
  process.env.ICE_DESKTOP = 'true';
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.JWT_SECRET = `desktop-${randomBytes(16).toString('hex')}`;
  process.env.CREDENTIAL_ENCRYPTION_KEY = `desktop-enc-${randomBytes(16).toString('hex')}`;
  process.env.FRONTEND_URL = `http://localhost:${GATEWAY_PORT}`;
  process.env.PORT = String(GATEWAY_PORT);
  process.env.NODE_ENV = 'production';

  // Push SQLite schema if DB doesn't exist
  if (!existsSync(dbPath)) {
    console.log('[desktop] Creating local database...');
    try {
      const { execSync } = await import('child_process');
      const schemaPath = is.dev
        ? join(__dirname, '../../packages/db/prisma/schema.sqlite.prisma')
        : join(process.resourcesPath || __dirname, 'prisma/schema.sqlite.prisma');

      if (existsSync(schemaPath)) {
        execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate`, {
          env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
          stdio: 'pipe',
        });
      }
    } catch (err: any) {
      console.error('[desktop] DB setup error:', err.message);
    }
  }

  // Auto-seed local user for desktop (no login needed)
  // In dev mode, the shared DB already has the test user — skip seeding
  if (!is.dev) {
    try {
      const prisma = (await import('@ice/db')).default;
      const { setDesktopUser } = await import('@ice/shared');

      let user = await prisma.user.findFirst();
      if (!user) {
        const org = await prisma.organisation.create({ data: { name: 'Local' } });
        user = await prisma.user.create({
          data: {
            name: 'Desktop User',
            email: 'desktop@ice.local',
            password_hash: '@@desktop-local@@',
            organisation_id: org.id,
          },
        });
        await prisma.organisationMember.create({
          data: { user_id: user.id, organisation_id: org.id, role: 'owner' },
        });
        console.log('[desktop] Created local user');
      }

      setDesktopUser(user.id, user.organisation_id || '');
    } catch (err: any) {
      console.error('[desktop] User seed error:', err.message);
    }
  }

  // In dev mode, the gateway runs as a separate process (started by dev:desktop script)
  // In production, the gateway is bundled and started here
  if (!is.dev) {
    console.log(`[desktop] Starting embedded backend on port ${GATEWAY_PORT}...`);
    try {
      await import('@ice/gateway/src/index.js');
    } catch (err: any) {
      console.error('[desktop] Gateway start error:', err.message);
    }
  } else {
    console.log('[desktop] Dev mode — gateway running externally');
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

  // Load the web app from the embedded gateway
  const appUrl = `http://localhost:${GATEWAY_PORT}`;

  if (is.dev) {
    // In dev, load from the web Vite dev server (same app as production)
    // The web proxy forwards /api to the gateway on GATEWAY_PORT
    const webDevUrl = 'http://localhost:5173';
    mainWindow.loadURL(webDevUrl);
  } else {
    // In production, the gateway serves the web app's static files
    mainWindow.loadURL(appUrl);
  }
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ice.desktop');

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getIconPath());
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
