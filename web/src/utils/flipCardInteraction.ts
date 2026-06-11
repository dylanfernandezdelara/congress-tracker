const DEFAULT_DRAG_THRESHOLD_PX = 10

export function shouldIgnoreFlipClick(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = DEFAULT_DRAG_THRESHOLD_PX,
): boolean {
  const dx = endX - startX
  const dy = endY - startY
  return Math.hypot(dx, dy) > threshold
}
