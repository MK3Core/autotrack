/** A side-view car outline, drawn in the current text color. */
export default function CarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 24H6.5a2 2 0 0 1-2-2v-4.2c0-2 1.4-3.6 3.3-4L17 12l7.2-6.3A5 5 0 0 1 27.5 4.5H41a5 5 0 0 1 3.8 1.8l5.6 6.5 6.3 1.2a4 4 0 0 1 3.3 3.9V22a2 2 0 0 1-2 2h-3.5" />
      <path d="M20.5 24h23" />
      <path d="M21 12l5.4-4.6h6.6V12z" strokeWidth="1.6" />
      <path d="M36.5 7.4h4.3l4.2 4.6h-8.5z" strokeWidth="1.6" />
      <circle cx="15" cy="24" r="5" />
      <circle cx="49" cy="24" r="5" />
      <circle cx="15" cy="24" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="49" cy="24" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
