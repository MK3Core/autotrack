import { useGoBack } from '../lib/useGoBack';
import './BackButton.css';

/**
 * For any page that isn't one of the bottom-nav top-level destinations
 * (Home, Add, Log, Reports, Data). Those are always one tap away from the
 * nav bar, so they don't need this, but a page reached by drilling in
 * (e.g. editing a specific fillup) does.
 */
export default function BackButton({ fallback = '/' }: { fallback?: string }) {
  const handleBack = useGoBack(fallback);

  return (
    <button type="button" className="back-button" onClick={handleBack}>
      <span className="back-button__chevron" aria-hidden="true">
        &#8249;
      </span>
      Back
    </button>
  );
}
