/**
 * Desktop Renderer App Shell
 *
 * Thin shell that imports shared UI from @ice/ui
 * and initializes the IPC-based API adapter.
 */
import React from 'react';
import { setApiAdapter } from '@ice/ui';
import { createIpcAdapter } from '../api/ipc-adapter';

// Initialize IPC adapter before rendering
setApiAdapter(createIpcAdapter());

export function App() {
  return (
    <div className="h-screen w-screen bg-background text-foreground">
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">ICE Desktop — Shared UI loaded from @ice/ui</p>
      </div>
    </div>
  );
}
