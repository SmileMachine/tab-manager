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
  const viewportLeft = window.scrollX + margin;
  const viewportRight = window.scrollX + window.innerWidth - margin;
  const viewportTop = window.scrollY + margin;
  const viewportBottom = window.scrollY + window.innerHeight - margin;
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
