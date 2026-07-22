import React from 'react';
import { createRoot } from 'react-dom/client';
import { WidgetApp } from './App';
import { initializeTheme } from '../stores/theme.store';
import '../styles/globals.css';

const cleanupTheme = initializeTheme();
window.addEventListener('beforeunload', cleanupTheme, { once: true });

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <WidgetApp />
    </React.StrictMode>
  );
}
