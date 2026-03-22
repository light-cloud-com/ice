/**
 * IPC API Adapter for Electron Desktop
 *
 * Implements IceAPI interface using Electron IPC (window.api)
 * instead of HTTP requests used by the web app.
 */
import type { IceAPI } from '@ice/ui';

declare global {
  interface Window {
    api: IceAPI;
  }
}

export function createIpcAdapter(): IceAPI {
  // In Electron, the preload script exposes window.api
  // This adapter wraps it to match the IceAPI interface
  if (typeof window !== 'undefined' && window.api) {
    return window.api;
  }

  // Fallback for development without Electron context
  throw new Error('Electron IPC bridge not available. Are you running in Electron?');
}
