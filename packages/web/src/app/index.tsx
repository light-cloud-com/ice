/**
 * React Application Entry Point
 */

import { setApiAdapter } from '@ui/shared/api/api-adapter';
import { createHttpApiAdapter } from '@ui/shared/api/http-api-adapter';
import { ThemeProvider } from '@ui/shared/hooks/use-theme';
import { store } from '@ui/store';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './app';
import '@fontsource-variable/jetbrains-mono';
import '../styles/globals.css';

// Initialize API adapter (HTTP for web, replaces Electron IPC)
setApiAdapter(createHttpApiAdapter());

// Get root element
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// Create React root and render
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
);
