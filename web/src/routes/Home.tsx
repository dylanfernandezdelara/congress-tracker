import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { congressGovBillUrl, parseBillQueryParam } from '@congress-tracker/shared/bill-id'
import { VOTE_LOOKBACK_DAYS } from '@congress-tracker/shared/feed-constants'

import { fetchRecentConfirmations, fetchRecentLaws } from '../api/client'
import type {
  RecentConfirmationsResponse,
  RecentLawsResponse,
  TightnessDot,
} from '../api/types'
import { ChamberFilterControl } from '../components/ChamberFilterControl'
import { FederalControlCompact } from '../components/FederalControlCompact'
import { FeedAdvancedFilters } from '../components/FeedAdvancedFilters'
import { FeedRow } from '../components/FeedRow'
import { FeedSearchInput } from '../components/FeedSearchInput'
import { FloorStatusChip } from '../components/FloorStatusChip'
import { LeftSidebar } from '../components/LeftSidebar'
import { MemberProfileProvider } from '../components/MemberProfileProvider'
import { RecentConfirmationsSection } from '../components/RecentConfirmationsSection'
import { RecentLawsSection } from '../components/RecentLawsSection'
import { RightRail } from '../components/RightRail'
import { SenateWaitingList } from '../components/SenateWaitingList'
import { TightnessDefectorSheet } from '../components/TightnessDefectorSheet'
import { TightnessStrip } from '../components/TightnessStrip'
import { copyAlignGridParam } from '../hooks/useAlignGrid'
import { useAsyncData } from '../hooks/useAsyncData'
import { useFeedPagination } from '../hooks/useFeedPagination'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMemberProfile } from '../hooks/useMemberProfile'
import { useStatsData } from '../hooks/useStatsData'
import { feedRowKey } from '../utils/billDeepLink'
import { getFeedRowStatus } from '../utils/feedRowStatus'
import { tightnessDotKey } from '../utils/tightnessLabels'
import {
  advancedFilterCount,
  advancedFilterSummary,
  type AdvancedFeedFilters,
} from '../utils/feedAdvancedFilters'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { timelineFloorChrome } from '../utils/feedQuiet'

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
  const { reload: reloadStats, session, tightness, defectors, portfolios } = useStatsData({
    enabled: feedSettled,
  })
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedDot, setSelectedDot] = useState<TightnessDot | null>(null)
  const [defectorSheetKey, setDefectorSheetKey] = useState(0)

  const openTightnessDot = useCallback((dot: TightnessDot) => {
    setSelectedDot(dot)
    setDefectorSheetKey((key) => key + 1)
  }, [])

  const closeTightnessDot = useCallback(() => {
    setSelectedDot(null)
  }, [])

  const openWaitingBill = useCallback(
    (billParam: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams()
        next.set('bill', billParam)
        copyAlignGridParam(prev, next)
        return next
      })
    },
    [setSearchParams],
  )

  const handleReloadFeed = useCallback(() => {
    reloadFeed()
    setRailRetryKey((k) => k + 1)
  }, [reloadFeed])

  const reloadAll = useCallback(() => {
    handleReloadFeed()
    reloadStats()
  }, [handleReloadFeed, reloadStats])

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

  const tightnessLoading = tightness.isLoading
  const selectedKey = selectedDot ? tightnessDotKey(selectedDot) : null
  const tightnessHouse = tightness.data?.house_passage ?? []
  const tightnessSenate = tightness.data?.senate ?? []
  const senateWaiting = tightness.data?.senate_waiting ?? []

  const tightnessStrip = (
    <TightnessStrip
      house={tightnessHouse}
      senate={tightnessSenate}
      selectedKey={selectedKey}
      onSelect={openTightnessDot}
      loading={tightnessLoading}
      error={tightness.error}
      onRetry={reloadStats}
    />
  )

  const senateWaitingList = (
    <SenateWaitingList
      items={senateWaiting}
      loading={tightnessLoading}
      error={tightness.error}
      onRetry={reloadStats}
      onOpenBill={openWaitingBill}
      compact={!isDesktop}
    />
  )

  const legislativeContext = (
    <RightRail
      house={tightnessHouse}
      senate={tightnessSenate}
      waiting={senateWaiting}
      selectedKey={selectedKey}
      onSelectDot={openTightnessDot}
      onOpenWaitingBill={openWaitingBill}
      loading={tightnessLoading}
      error={tightness.error}
      onRetry={reloadStats}
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

  const floorChrome = timelineFloorChrome({
    items,
    chamber,
    houseLast: session.data?.house.date_range.last,
    senateLast: session.data?.senate.date_range.last,
    confirmationVoteDates: (recentConfirmations.data?.confirmations ?? []).map((item) => item.vote_date),
    through: searchQuery || advancedCount > 0 ? 'page' : 'session',
  })

  const missingBill = billMissingNotice ? parseBillQueryParam(searchParams.get('bill')) : null
  const missingBillUrl = missingBill
    ? congressGovBillUrl(missingBill.congress, missingBill.type, missingBill.number)
    : null

  // Decided vs proposed: votes, laws and other floor action lead; bills that were only
  // introduced (most with no summary yet) fold into one group so they don't bury them.
  // With a search or filter the reader asked for these bills, so nothing is folded.
  const groupIntroductions = !searchQuery && advancedCount === 0
  const decidedItems = groupIntroductions
    ? items.filter((item) => getFeedRowStatus(item).kind !== 'introduced')
    : items
  const introducedItems = groupIntroductions
    ? items.filter((item) => getFeedRowStatus(item).kind === 'introduced')
    : []
  const expandedIsIntroduced =
    expandedRowKey != null && introducedItems.some((item) => feedRowKey(item) === expandedRowKey)
  const [introOpen, setIntroOpen] = useState(false)
  useEffect(() => {
    if (expandedIsIntroduced) setIntroOpen(true)
  }, [expandedIsIntroduced])

  const renderRows = (rows: typeof items) =>
    rows.map((item) => {
      const rowKey = feedRowKey(item)
      return (
        <FeedRow
          key={rowKey}
          item={item}
          isExpanded={expandedRowKey === rowKey}
          onToggle={toggleRow}
        />
      )
    })

  return (
    <MemberProfileProvider>
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
        <p className="home-lede">
          What Congress voted on and passed in the last {VOTE_LOOKBACK_DAYS} days, in plain English, and how
          each party voted.
        </p>
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
            <Banner
              status="info"
              title={`That bill isn’t in the last ${VOTE_LOOKBACK_DAYS} days`}
              description={
                <>
                  It has had no floor action since then, so it isn&rsquo;t listed here.
                  {missingBillUrl ? (
                    <>
                      {' '}
                      <a href={missingBillUrl} target="_blank" rel="noopener noreferrer" className="congress-link">
                        Read it on congress.gov ↗
                      </a>
                    </>
                  ) : null}
                </>
              }
              isDismissable
              dismissLabel="Dismiss"
              onDismiss={dismissBillMissingNotice}
            />
          </div>
        ) : null}

        {showSkeleton ? <FeedSkeleton /> : null}

        {feedError && items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-card px-6 py-8 text-center">
            <p className="text-ui font-normal text-muted-foreground">{feedError}</p>
            <Button variant="ghost" size="sm" label="Retry" onClick={reloadAll} />
          </div>
        ) : null}

        {!showSkeleton && !feedError && !showFeed && !inFlight ? (
          <div className="home-feed-empty">
            <FloorStatusChip house={floorChrome.house} senate={floorChrome.senate} />
            <p className="text-ui font-normal text-faint">{emptyCopy}</p>
            {searchQuery ? (
              <Button variant="ghost" size="sm" label="Clear search" onClick={clearSearch} />
            ) : null}
            {chamber && !searchQuery ? (
              <Button variant="ghost" size="sm" label="Show all chambers" onClick={() => setChamberFilter(null)} />
            ) : null}
            {advancedCount > 0 && !searchQuery ? (
              <Button variant="ghost" size="sm" label="Clear filters" onClick={clearAdvancedFilters} />
            ) : null}
          </div>
        ) : null}

        {showFeed ? (
          <section id="feed-top" aria-busy={listRefreshing || undefined}>
            <div className="home-feed-header">
              {/* The feed is the page; the heading is for screen readers and outline only. */}
              <h2 className="sr-only">Chronological timeline</h2>
              <p className="home-feed-count">
                {total} {total === 1 ? 'bill' : 'bills'}
                {floorChrome.throughLabel ? ` · through ${floorChrome.throughLabel}` : ''}
                {countSuffix ? ` · ${countSuffix}` : ''}
              </p>
              <FloorStatusChip house={floorChrome.house} senate={floorChrome.senate} />
            </div>
            {floorChrome.notice ? (
              <p className="home-feed-quiet" role="status">
                {floorChrome.notice}
              </p>
            ) : null}

            <ul className={`feed-list${listRefreshing ? ' is-refreshing' : ''}`}>
              {renderRows(decidedItems)}
            </ul>

            {introducedItems.length > 0 ? (
              <details
                className="home-intro-group"
                open={introOpen}
                onToggle={(event) => setIntroOpen((event.currentTarget as HTMLDetailsElement).open)}
              >
                <summary className="home-intro-group-summary">
                  <span className="home-intro-group-title">
                    {introducedItems.length} new {introducedItems.length === 1 ? 'bill' : 'bills'} introduced
                  </span>
                  <span className="home-intro-group-meta">
                    No floor vote yet
                  </span>
                </summary>
                <ul className="feed-list">{renderRows(introducedItems)}</ul>
              </details>
            ) : null}

            {feedError ? (
              <p className="feed-pagination-status" role="alert">
                {feedError}{' '}
<Button
                  variant="ghost"
                  size="sm"
                  label="Retry"
                  onClick={() => {
                    if (lastFeedModeRef.current === 'append' && hasMore) {
                      loadMore()
                    } else {
                      handleReloadFeed()
                    }
                  }}
                />
              </p>
            ) : null}

            {hasMore || isLoadingMore ? (
              <nav className="feed-pagination" aria-label="Feed pages">
<Button
                  variant="secondary"
                  label="Load more"
                  onClick={loadMore}
                  isLoading={isLoadingMore}
                  isDisabled={!hasMore || (inFlight && !isLoadingMore)}
                />
                <p className="feed-pagination-status">
                  Showing {items.length} of {total}
                </p>
              </nav>
            ) : null}
          </section>
        ) : null}

        <div className="home-feed-secondary">
          <RecentLawsSection
            laws={recentLaws.data?.laws ?? null}
            loading={recentLawsLoading}
            error={recentLaws.error}
            onRetry={handleReloadFeed}
          />
          <RecentConfirmationsSection
            confirmations={recentConfirmations.data?.confirmations ?? null}
            loading={recentConfirmationsLoading}
            error={recentConfirmations.error}
            onRetry={handleReloadFeed}
          />
          {!isDesktop ? (
            <h2 className="home-glance-heading">Congress at a glance</h2>
          ) : null}
          {!isDesktop ? <div className="home-glance-control">{federalControl}</div> : null}
          {!isDesktop ? <div className="home-tightness-mobile">{tightnessStrip}</div> : null}
          {!isDesktop ? senateWaitingList : null}
        </div>

        {!isDesktop ? (
          <div className="home-mobile-rails">
            <section className="home-mobile-rail-section" aria-label="Members in Congress">
              {memberSpotlights}
            </section>
          </div>
        ) : null}
      </main>

      {isDesktop ? (
        <aside className="home-rail home-rail--right" aria-label="Legislative context">
          <div className="home-rail-stack">{legislativeContext}</div>
        </aside>
      ) : null}

      <TightnessDefectorSheet
        open={selectedDot != null}
        dot={selectedDot}
        selectionKey={defectorSheetKey}
        onClose={closeTightnessDot}
      />
      </div>
    </MemberProfileProvider>
  )
}
