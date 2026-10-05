import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Tabs stay mounted while hidden (see App.tsx), so their state survives a tab
 * switch. Call this to throw away unsaved work, like a half-filled form,
 * whenever the user navigates off `tabPath`.
 */
export function useOnTabLeave(tabPath: string, onLeave: () => void) {
  const { pathname } = useLocation();
  const active = pathname === tabPath;
  useEffect(() => {
    if (!active) onLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
