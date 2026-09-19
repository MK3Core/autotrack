import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useGoBack } from '../lib/useGoBack';

// Bottom-nav destinations. They have no BackButton of their own, so the
// back gesture sends them to the Log page ('/') instead of walking through
// whatever tabs were visited before.
const TOP_LEVEL_PATHS = ['/reports', '/vehicles', '/data'];

/**
 * Wires Android's back gesture/button into the router. Without a listener
 * the WebView's default handling fights HashRouter's history. Renders
 * nothing; must be mounted inside the router.
 */
export default function NativeBackHandler() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const goBack = useGoBack('/');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = CapacitorApp.addListener('backButton', () => {
      if (pathname === '/') {
        // Nowhere left to go back to: leave the app like a normal Android app.
        CapacitorApp.exitApp();
      } else if (TOP_LEVEL_PATHS.includes(pathname)) {
        navigate('/');
      } else {
        goBack();
      }
    });

    return () => {
      handle.then((h) => h.remove());
    };
  }, [pathname, navigate, goBack]);

  return null;
}
