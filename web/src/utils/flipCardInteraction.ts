const DEFAULT_DRAG_THRESHOLD_PX = 10
const DEFAULT_SCROLL_THRESHOLD_PX = 2

export function shouldIgnoreFlipClick(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = DEFAULT_DRAG_THRESHOLD_PX,
  startScrollTop?: number,
  endScrollTop?: number,
  scrollThreshold = DEFAULT_SCROLL_THRESHOLD_PX,
): boolean {
  if (
    startScrollTop !== undefined &&
    endScrollTop !== undefined &&
    Math.abs(endScrollTop - startScrollTop) > scrollThreshold
  ) {
    return true
  }

  const dx = endX - startX
  const dy = endY - startY
  return Math.hypot(dx, dy) > threshold
}
