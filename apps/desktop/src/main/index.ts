/**
 * ICE Desktop - Electron Main Process
 *
 * Entry point for the Electron main process.
 * Handles window management, IPC, and native integrations.
 */

import { app, BrowserWindow, shell, screen } from 'electron';
import { join, resolve } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { register_ipc_handlers } from './ipc-handlers';
import { registerDeployHandlers } from './deploy-handler';
import { create_application_menu } from './menu';

// App icon path - resolve from app root
const getIconPath = (): string => {
  const iconName = process.platform === 'win32' ? 'icon.ico' : '512x512.png';

  if (is.dev) {
    return resolve(__dirname, '../../resources/icons', iconName);
  }
  return join(process.resourcesPath || __dirname, 'icons', iconName);
};

let main_window: BrowserWindow | null = null;
let splash_window: BrowserWindow | null = null;
let splash_shown_at: number = 0;

// Minimum time to display splash screen (in milliseconds)
const MINIMUM_SPLASH_DURATION = 4000;

/**
 * Create and show the splash/loading screen
 */
function create_splash_window(): void {
  splash_window = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the splash screen HTML
  splash_window.loadFile(join(__dirname, 'splash.html'));

  // Show splash when ready and record the time
  splash_window.once('ready-to-show', () => {
    splash_shown_at = Date.now();
    splash_window?.show();
  });
}

function create_window(): void {
  // Get the display where splash is shown to open main window on same screen
  let display = screen.getPrimaryDisplay();
  if (splash_window) {
    const splash_bounds = splash_window.getBounds();
    display = screen.getDisplayNearestPoint({
      x: splash_bounds.x + splash_bounds.width / 2,
      y: splash_bounds.y + splash_bounds.height / 2,
    });
  }

  // Calculate centered position on the same display
  const window_width = 2400;
  const window_height = 1600;
  const x = Math.round(display.bounds.x + (display.bounds.width - window_width) / 2);
  const y = Math.round(display.bounds.y + (display.bounds.height - window_height) / 2);

  // Create the browser window on the same screen as splash
  main_window = new BrowserWindow({
    width: window_width,
    height: window_height,
    x,
    y,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    icon: getIconPath(),
    autoHideMenuBar: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show main window and close splash when ready (respecting minimum duration)
  main_window.on('ready-to-show', () => {
    const elapsed = Date.now() - splash_shown_at;
    const remaining = Math.max(0, MINIMUM_SPLASH_DURATION - elapsed);

    // Wait for minimum splash duration before showing main window
    setTimeout(() => {
      if (splash_window) {
        splash_window.close();
        splash_window = null;
      }
      main_window?.show();
    }, remaining);
  });

  // Handle external links
  main_window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    main_window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    main_window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Open DevTools in development
  if (is.dev) {
    // main_window.webContents.openDevTools({ mode: 'right' });
  }
}

// App lifecycle
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.light-cloud.desktop');

  // Set dock icon for macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getIconPath());
  }

  // Default open or close DevTools by F12 in dev
  // and ignore CommandOrControl + R in production
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Register IPC handlers
  register_ipc_handlers();
  registerDeployHandlers();

  // Create menu
  create_application_menu();

  // Show splash screen first
  create_splash_window();

  // Create main window (splash closes when main is ready)
  create_window();

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      create_window();
    }
  });
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event) => {
    event.preventDefault();
  });
});

// Export for testing
export { main_window };
