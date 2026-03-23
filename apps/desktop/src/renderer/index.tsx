import { store, setApiAdapter } from '@ice/ui';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createIpcAdapter } from './api/ipc-adapter';
import { App } from './app/app';
import './styles/globals.css';

// Initialize IPC adapter (replaces HTTP adapter used by web)
setApiAdapter(createIpcAdapter());

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
