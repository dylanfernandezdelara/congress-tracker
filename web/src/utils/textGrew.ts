import type { BillTextChanges, FeedItem } from '../api/types'

/** True when newer bill text added sections the digest does not cover. */
export function hasAddedProvisions(
  changes: Pick<BillTextChanges, 'added_provisions'> | null | undefined,
): boolean {
  return (changes?.added_provisions.length ?? 0) > 0
}

export function feedItemTextGrew(item: Pick<FeedItem, 'text_changes'>): boolean {
  return hasAddedProvisions(item.text_changes)
}
