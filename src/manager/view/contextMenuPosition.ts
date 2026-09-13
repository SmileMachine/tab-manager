export interface ContextMenuPoint {
  x: number;
  y: number;
}

export interface ContextMenuSize {
  height: number;
  width: number;
}

export function contextMenuPosition(menu: ContextMenuPoint, size: ContextMenuSize) {
  const margin = 8;
  const offset = 6;
  const width = size.width || 260;
  const height = size.height || 0;
  // Context-menu coordinates come from MouseEvent.clientX/clientY and the menu
  // is fixed to the viewport. Do not add document scroll offsets here: doing so
  // makes the workspace header/sidebar look like extra menu padding.
  const viewportLeft = margin;
  const viewportRight = window.innerWidth - margin;
  const viewportTop = margin;
  const viewportBottom = window.innerHeight - margin;
  const maxLeft = Math.max(viewportLeft, viewportRight - width);
  const left = Math.min(Math.max(menu.x + offset, viewportLeft), maxLeft);
  const opensUp = height > 0 && menu.y + offset + height > viewportBottom;
  const top = opensUp ? menu.y - height - offset : menu.y + offset;
  const maxTop = Math.max(viewportTop, viewportBottom - height);

  return {
    left,
    top: Math.min(Math.max(top, viewportTop), maxTop)
  };
}
