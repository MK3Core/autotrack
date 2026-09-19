import { useLocation, useNavigate } from 'react-router-dom';
import './BackButton.css';

/**
 * For any page that isn't one of the bottom-nav top-level destinations
 * (Home, Add, Log, Reports, Data). Those are always one tap away from the
 * nav bar, so they don't need this, but a page reached by drilling in
 * (e.g. editing a specific fillup) does.
 */
export default function BackButton({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleBack() {
    // location.key is 'default' when this page was loaded directly (no in-app
    // history to go back to, e.g. a bookmark or a page refresh).
    if (location.key === 'default') {
      navigate(fallback);
    } else {
      navigate(-1);
    }
  }

  return (
    <button type="button" className="back-button" onClick={handleBack}>
      <span className="back-button__chevron" aria-hidden="true">
        &#8249;
      </span>
      Back
    </button>
  );
}
