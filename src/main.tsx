import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import './index.css';
import App from './App.tsx';
import { VehicleProvider } from './lib/VehicleContext';

// The app is always dark-themed (never switches to light), so the system
// bar icons (clock, battery, etc.) need to always render light/white to
// stay visible against our dark status/nav bar. See capacitor.config.ts
// for the matching bar background color setup.
if (Capacitor.isNativePlatform()) {
  SystemBars.setStyle({ style: SystemBarsStyle.Dark });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <VehicleProvider>
        <App />
      </VehicleProvider>
    </HashRouter>
  </StrictMode>,
);
