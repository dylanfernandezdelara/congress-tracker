type FeedSearchInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onClear: () => void
}

export function FeedSearchInput({ value, onChange, onSubmit, onClear }: FeedSearchInputProps) {
  const hasValue = value.trim() !== ''

  return (
    <div className="feed-search">
      <label className="visually-hidden" htmlFor="feed-search-input">
        Search bills
      </label>
      <input
        id="feed-search-input"
        type="search"
        className="feed-search-input"
        value={value}
        placeholder="Search bills"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSubmit()
            return
          }
          if (event.key === 'Escape' && hasValue) {
            event.preventDefault()
            onClear()
          }
        }}
      />
      {hasValue ? (
        <button
          type="button"
          className="feed-search-clear"
          aria-label="Clear search"
          title="Clear search"
          onClick={onClear}
        >
          <span aria-hidden="true" className="feed-search-clear-glyph">
            ×
          </span>
        </button>
      ) : null}
    </div>
  )
}
