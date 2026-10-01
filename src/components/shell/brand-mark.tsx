/** A sun rising over the horizon. Decorative: always paired with the app name. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M6 21a10 10 0 0 1 20 0Z"
        fill="var(--color-accent)"
        stroke="var(--color-accent-strong)"
        strokeWidth="1.5"
      />
      <path
        d="M16 5.5v3M7.2 9.2l2.1 2.1M24.8 9.2l-2.1 2.1M3.5 16h3M25.5 16h3"
        stroke="var(--color-accent-strong)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M3 24.5h26" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
