export const DEFAULT_POPUP_HEIGHT_PX = 560;

export function calculatePopupHeight(viewportHeight: number) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return DEFAULT_POPUP_HEIGHT_PX;
  }

  return Math.floor(viewportHeight);
}

export function measurePopupViewportHeight() {
  const viewportHeights = [window.innerHeight, document.documentElement.clientHeight].filter(
    (height) => Number.isFinite(height) && height > 0
  );

  return calculatePopupHeight(
    viewportHeights.length > 0 ? Math.min(...viewportHeights) : DEFAULT_POPUP_HEIGHT_PX
  );
}
