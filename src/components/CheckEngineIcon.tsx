/** The dashboard "check engine" glyph, drawn in the current text color. */
export default function CheckEngineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 8.5h12l2.5 2.5v8H11l-2.5-2.5z" />
      <path d="M11.5 8.5V6h6v2.5" />
      <path d="M10 6h9" />
      <path d="M8.5 13H6M6 10.5v5" />
      <path d="M23 13h2.5M25.5 11v4.5" />
      <path d="M13 12.5h6M13 15.5h6" strokeWidth="1.2" />
    </svg>
  );
}
