/**
 * Desktop App Shell
 *
 * Renders the full ICE UI from @ice/ui.
 * Uses IPC adapter for local deployments (no backend needed).
 */

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@ice/ui/src/shared/components/error-boundary';
import { AppBar } from '@ice/ui/src/shared/components/app-bar';
import { MainLayout } from '@ice/ui/src/shared/components/main-layout';
import { ProjectWizard } from '@ice/ui/wizard';
import { DebugOverlay } from '@ice/ui/debug';
import { DeployPanel } from '@ice/ui/deploy';
import { initializeGraph } from '@ice/ui/src/store/slices/graph-slice';
import { ThemeProvider } from '@ice/ui/src/shared/hooks/use-theme';
import type { AppDispatch, RootState } from '@ice/ui/src/store';

function CanvasView() {
  const dispatch = useDispatch<AppDispatch>();
  const deployIsOpen = useSelector((s: RootState) => s.deploy.isOpen);

  useEffect(() => {
    dispatch(initializeGraph());
  }, [dispatch]);

  return (
    <div className="h-screen flex flex-col bg-ice-base">
      <AppBar />
      <MainLayout view="canvas" />
      <ProjectWizard />
      <DebugOverlay />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary name="ICE Desktop">
      <ThemeProvider>
        <HashRouter>
          <Routes>
            <Route path="/*" element={<CanvasView />} />
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
