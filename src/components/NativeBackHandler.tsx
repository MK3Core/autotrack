import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useGoBack } from '../lib/useGoBack';
import './NativeBackHandler.css';

// How long the "press back again" prompt stays armed.
const EXIT_CONFIRM_MS = 2000;

// Bottom-nav destinations. They have no BackButton of their own, so the
// back gesture sends them to the Log page ('/') instead of walking through
// whatever tabs were visited before.
const TOP_LEVEL_PATHS = ['/reports', '/vehicles', '/data'];

/**
 * Wires Android's back gesture/button into the router. Without a listener
 * the WebView's default handling fights HashRouter's history. Exiting from
 * the Log page takes two presses in quick succession, with a toast between.
 * Must be mounted inside the router.
 */
export default function NativeBackHandler() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const goBack = useGoBack('/');
  const [showExitHint, setShowExitHint] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = CapacitorApp.addListener('backButton', () => {
      if (pathname === '/') {
        // Nowhere left to go back to: require a second press to leave.
        if (exitTimer.current) {
          clearTimeout(exitTimer.current);
          exitTimer.current = undefined;
          CapacitorApp.exitApp();
        } else {
          setShowExitHint(true);
          exitTimer.current = setTimeout(() => {
            exitTimer.current = undefined;
            setShowExitHint(false);
          }, EXIT_CONFIRM_MS);
        }
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

  if (!showExitHint) return null;
  return (
    <div className="exit-toast" role="status">
      Press back again to exit
    </div>
  );
}
