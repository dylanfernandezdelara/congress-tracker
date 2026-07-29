/** Shared expand/collapse chevron used by feed rows and recent sections. */
export function ExpandChevron() {
  return (
    <span className="feed-row-chevron" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" focusable="false">
        <path
          d="M6 3.5 10.5 8 6 12.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
