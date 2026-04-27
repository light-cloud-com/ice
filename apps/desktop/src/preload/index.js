/**
 * Preload Script — Minimal bridge for desktop-specific features
 *
 * The web app communicates with the backend via HTTP (same as production).
 * The preload only exposes Electron-specific features: menu actions, window state, updates.
 */
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    onMenuAction: (callback) => {
        const handler = (_event, action) => callback(action);
        ipcRenderer.on('menu-action', handler);
        return () => ipcRenderer.removeListener('menu-action', handler);
    },
    onFullscreenChange: (callback) => {
        const handler = (_event, isFullscreen) => callback(isFullscreen);
        ipcRenderer.on('fullscreen-change', handler);
        return () => ipcRenderer.removeListener('fullscreen-change', handler);
    },
    getFullscreenState: () => ipcRenderer.invoke('get-fullscreen-state'),
    // Auto-update
    onUpdateStatus: (callback) => {
        const handler = (_event, status) => callback(status);
        ipcRenderer.on('update-status', handler);
        return () => ipcRenderer.removeListener('update-status', handler);
    },
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});
