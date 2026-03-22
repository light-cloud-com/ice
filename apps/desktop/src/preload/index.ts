/**
 * Preload Script — Minimal bridge for desktop-specific features
 *
 * The web app communicates with the backend via HTTP (same as production).
 * The preload only exposes Electron-specific features: menu actions, window state.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_event: any, isFullscreen: boolean) => callback(isFullscreen);
    ipcRenderer.on('fullscreen-change', handler);
    return () => ipcRenderer.removeListener('fullscreen-change', handler);
  },
});
