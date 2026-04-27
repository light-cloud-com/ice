/**
 * ICE Desktop — Electron Main Process
 *
 * Embeds the full web app + backend inside Electron.
 * The renderer loads from an embedded Express server (same gateway as production).
 * No separate IPC handlers — same code path as the web app.
 */
import { BrowserWindow } from 'electron';
declare let mainWindow: BrowserWindow | null;
export { mainWindow };
