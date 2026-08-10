import { useCallback, useState } from 'react'

import { VOTE_LOOKBACK_DAYS } from '@congress-tracker/shared/feed-constants'

import { fetchNotableVotes, fetchRecentConfirmations, fetchRecentLaws } from '../api/client'
import type {
  NotableVotesResponse,
  RecentConfirmationsResponse,
  RecentLawsResponse,
} from '../api/types'
import { ChamberFilterControl } from '../components/ChamberFilterControl'
import { FederalControlCompact } from '../components/FederalControlCompact'
import { FeedAdvancedFilters } from '../components/FeedAdvancedFilters'
import { FeedRow } from '../components/FeedRow'
import { FeedSearchInput } from '../components/FeedSearchInput'
import { LeftSidebar } from '../components/LeftSidebar'
import { NotableVotesSection } from '../components/NotableVotesSection'
import { RecentConfirmationsSection } from '../components/RecentConfirmationsSection'
import { RecentLawsSection } from '../components/RecentLawsSection'
import { RightRail } from '../components/RightRail'
import { useAsyncData } from '../hooks/useAsyncData'
import { useFeedPagination } from '../hooks/useFeedPagination'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useStatsData } from '../hooks/useStatsData'
import { feedRowKey } from '../utils/billDeepLink'
import {
  advancedFilterCount,
  advancedFilterSummary,
  type AdvancedFeedFilters,
} from '../utils/feedAdvancedFilters'
import { useMemberProfile } from '../hooks/useMemberProfile'

const DESKTOP_RAIL_QUERY = '(min-width: 1024px)'

function FeedSkeleton() {
  return (
    <ul className="feed-list" aria-hidden="true">
      <li className="feed-row-skeleton" />
      <li className="feed-row-skeleton" />
      <li className="feed-row-skeleton" />
    </ul>
  )
}

function emptyFeedCopy(
  chamber: 'House' | 'Senate' | null,
  advanced: AdvancedFeedFilters,
  searchQuery: string,
  sponsorName?: string | null,
): string {
  const sponsorBits = advancedFilterSummary(advanced, sponsorName)
  const sponsorScope = sponsorBits.length > 0 ? ` · ${sponsorBits.join(' · ')}` : ''
  if (searchQuery) {
    const chamberScope = chamber ? `${chamber} ` : ''
    return `No ${chamberScope}matches for “${searchQuery}”${sponsorScope}.`
  }
  const chamberScope = chamber ? `${chamber} ` : ''
  if (sponsorBits.length > 0) {
    return `No ${chamberScope}passage votes matching ${sponsorBits.join(' · ')} in the last ${VOTE_LOOKBACK_DAYS} days.`
  }
  return `No ${chamberScope}passage votes in the last ${VOTE_LOOKBACK_DAYS} days.`
}

export default function Home() {
  const isDesktop = useMediaQuery(DESKTOP_RAIL_QUERY)
  const {
    chamber,
    advancedFilters,
    searchQuery,
    searchDraft,
    items,
    total,
    hasMore,
    feedError,
    isInitialLoading,
    isLoadingMore,
    expandedRowKey,
    feedSettled,
    billMissingNotice,
    lastFeedModeRef,
    reloadFeed,
    loadMore,
    setChamberFilter,
    patchAdvancedFilters,
    clearAdvancedFilters,
    setSearchDraft,
    submitSearch,
    clearSearch,
    toggleRow,
    dismissBillMissingNotice,
  } = useFeedPagination()
  const { profile: sponsorProfile } = useMemberProfile(advancedFilters.sponsor)
  const sponsorName = sponsorProfile?.name ?? null

  const [railRetryKey, setRailRetryKey] = useState(0)
  const { reload: reloadStats, session, pulse, defectors, portfolios } = useStatsData({
    enabled: feedSettled,
  })

  const handleReloadFeed = useCallback(() => {
    reloadFeed()
    setRailRetryKey((k) => k + 1)
  }, [reloadFeed])

  const reloadAll = useCallback(() => {
    handleReloadFeed()
    reloadStats()
  }, [handleReloadFeed, reloadStats])

  const notableVotes = useAsyncData<NotableVotesResponse>({
    deps: [railRetryKey],
    enabled: feedSettled,
    load: () => fetchNotableVotes(3),
    mapError: () => "Couldn't load notable votes.",
  })

  const recentLaws = useAsyncData<RecentLawsResponse>({
    deps: [railRetryKey],
    enabled: feedSettled,
    load: () => fetchRecentLaws(5),
    mapError: () => "Couldn't load new laws.",
  })

  const recentConfirmations = useAsyncData<RecentConfirmationsResponse>({
    deps: [railRetryKey],
    enabled: feedSettled,
    load: () => fetchRecentConfirmations(5),
    mapError: () => "Couldn't load confirmations.",
  })

  const showFeed = items.length > 0
  const showSkeleton = isInitialLoading && items.length === 0
  const listRefreshing = isInitialLoading && items.length > 0
  const inFlight = isInitialLoading || isLoadingMore
  const notableLoading = !feedSettled || notableVotes.isLoading
  const recentLawsLoading = !feedSettled || recentLaws.isLoading
  const recentConfirmationsLoading = !feedSettled || recentConfirmations.isLoading

  const federalControl = (
    <FederalControlCompact
      composition={session.data?.composition ?? null}
      loading={session.isLoading}
      error={session.error}
      onRetry={reloadStats}
    />
  )

  const memberSpotlights = (
    <LeftSidebar
      session={session}
      defectors={defectors}
      portfolios={portfolios}
      onRetry={reloadStats}
    />
  )

  const legislativePulse = (
    <RightRail
      pulse={pulse.data}
      loading={pulse.isLoading}
      error={pulse.error}
      onRetry={reloadStats}
    />
  )

  const notableVotesSection = (
    <NotableVotesSection
      variant="compact"
      notable={notableVotes.data?.notable ?? null}
      loading={notableLoading}
      error={notableVotes.error}
      onRetry={handleReloadFeed}
    />
  )

  const emptyCopy = emptyFeedCopy(chamber, advancedFilters, searchQuery, sponsorName)

  const advancedCount = advancedFilterCount(advancedFilters)

  const countSuffix = [
    chamber ? chamber : null,
    ...advancedFilterSummary(advancedFilters, sponsorName),
    searchQuery ? `“${searchQuery}”` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="home-shell">
      {isDesktop ? (
        <aside className="home-rail home-rail--left" aria-label="Session context">
          <div className="home-rail-stack">
            {federalControl}
            <section aria-label="Members in Congress">{memberSpotlights}</section>
          </div>
        </aside>
      ) : null}

      <main id="content" className="home-feed-column feed-main">
        <div className="home-feed-toolbar">
          <FeedAdvancedFilters
            filters={advancedFilters}
            sponsorName={sponsorName}
            onChange={patchAdvancedFilters}
            onClear={clearAdvancedFilters}
            renderToolbar={(actions) => (
              <div className="home-feed-toolbar-primary">
                <ChamberFilterControl value={chamber} onChange={setChamberFilter} />
                {actions}
                <FeedSearchInput
                  value={searchDraft}
                  onChange={setSearchDraft}
                  onSubmit={submitSearch}
                  onClear={clearSearch}
                />
              </div>
            )}
          />
        </div>

        {billMissingNotice ? (
          <div className="home-feed-notice" role="status">
            <p className="home-feed-notice-text">That bill is no longer in the recent feed.</p>
            <button
              type="button"
              className="home-feed-notice-dismiss"
              onClick={dismissBillMissingNotice}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {showSkeleton ? <FeedSkeleton /> : null}

        {feedError && items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-card px-6 py-8 text-center">
            <p className="text-[13px] text-secondary">{feedError}</p>
            <button type="button" className="ghost-button" onClick={reloadAll}>
              Retry
            </button>
          </div>
        ) : null}

        {!showSkeleton && !feedError && total === 0 && !inFlight ? (
          <div className="home-feed-empty">
            <p className="text-[13px] text-faint">{emptyCopy}</p>
            {searchQuery ? (
              <button type="button" className="ghost-button" onClick={clearSearch}>
                Clear search
              </button>
            ) : null}
            {chamber && !searchQuery ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setChamberFilter(null)}
              >
                Show all chambers
              </button>
            ) : null}
            {advancedCount > 0 && !searchQuery ? (
              <button type="button" className="ghost-button" onClick={clearAdvancedFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}

        {showFeed ? (
          <section id="feed-top" aria-busy={listRefreshing || undefined}>
            <div className="home-feed-header">
              <h2 className="home-feed-title">Chronological timeline</h2>
              <p className="home-feed-count">
                {items.length} of {total} passage {total === 1 ? 'vote' : 'votes'}
                {countSuffix ? ` · ${countSuffix}` : ''}
              </p>
            </div>

            <ul className={`feed-list${listRefreshing ? ' is-refreshing' : ''}`}>
              {items.map((item) => {
                const rowKey = feedRowKey(item)
                return (
                  <FeedRow
                    key={rowKey}
                    item={item}
                    isExpanded={expandedRowKey === rowKey}
                    onToggle={toggleRow}
                  />
                )
              })}
            </ul>

            {feedError ? (
              <p className="feed-pagination-status" role="alert">
                {feedError}{' '}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    if (lastFeedModeRef.current === 'append' && hasMore) {
                      loadMore()
                    } else {
                      handleReloadFeed()
                    }
                  }}
                >
                  Retry
                </button>
              </p>
            ) : null}

            {hasMore || isLoadingMore ? (
              <nav className="feed-pagination" aria-label="Feed pages">
                <button
                  type="button"
                  className="feed-pagination-button"
                  onClick={loadMore}
                  disabled={!hasMore || inFlight}
                  aria-label="Load more"
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </button>
                <p className="feed-pagination-status">
                  {items.length} of {total} votes
                </p>
              </nav>
            ) : null}
          </section>
        ) : null}

        <div className="home-feed-secondary">
          <RecentConfirmationsSection
            confirmations={recentConfirmations.data?.confirmations ?? null}
            loading={recentConfirmationsLoading}
            error={recentConfirmations.error}
            onRetry={handleReloadFeed}
          />
          <RecentLawsSection
            laws={recentLaws.data?.laws ?? null}
            loading={recentLawsLoading}
            error={recentLaws.error}
            onRetry={handleReloadFeed}
          />
        </div>

        {!isDesktop ? (
          <div className="home-mobile-rails">
            <div className="home-mobile-rail-section">{notableVotesSection}</div>
            <section className="home-mobile-rail-section" aria-label="Legislative pulse">
              {legislativePulse}
            </section>
            <div className="home-mobile-rail-section">{federalControl}</div>
            <section className="home-mobile-rail-section" aria-label="Members in Congress">
              {memberSpotlights}
            </section>
          </div>
        ) : null}
      </main>

      {isDesktop ? (
        <aside className="home-rail home-rail--right" aria-label="Legislative context">
          <div className="home-rail-stack">
            <section aria-label="Legislative pulse">{legislativePulse}</section>
            {notableVotesSection}
          </div>
        </aside>
      ) : null}
    </div>
  )
}
