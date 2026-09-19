import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * The single definition of "go back" for drill-in pages, shared by the
 * on-screen BackButton and the Android back gesture (NativeBackHandler).
 */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    // location.key is 'default' when this page was loaded directly (no in-app
    // history to go back to, e.g. a bookmark or a page refresh).
    if (location.key === 'default') {
      navigate(fallback);
    } else {
      navigate(-1);
    }
  }, [navigate, location.key, fallback]);
}
