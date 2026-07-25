/** Shared bill text-diff tuning — consumed by worker and web. */

/**
 * Provisions shown in the UI before the reader expands the list. Bounds initial
 * density, not the API payload.
 */
export const TEXT_CHANGES_MAX_LISTED_PROVISIONS = 5

/**
 * Max added provisions persisted and served in the feed. Bounds JSON payload
 * size; anything beyond is reported only as `more_added_count`.
 */
export const TEXT_CHANGES_MAX_STORED_PROVISIONS = 25
