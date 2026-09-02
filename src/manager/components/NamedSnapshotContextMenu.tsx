import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import type { NamedSnapshot } from '../application/snapshotActions';
import { useEscapeHandler } from '../hooks/useEscapeStack';
import { contextMenuPosition } from '../view/contextMenuPosition';

export interface NamedSnapshotContextMenuState {
  item: NamedSnapshot;
  x: number;
  y: number;
}

export function NamedSnapshotContextMenu({ menu, onClose, onDelete, onRename }: {
  menu: NamedSnapshotContextMenuState;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuSize, setMenuSize] = useState({ height: 0, width: 220 });
  const menuPosition = contextMenuPosition(menu, menuSize);

  useEffect(() => {
    const pointerListener = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', pointerListener);
    return () => document.removeEventListener('pointerdown', pointerListener);
  }, [onClose]);

  useEscapeHandler(useCallback(() => {
    onClose();
    return true;
  }, [onClose]));

  useEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (rect) setMenuSize({ height: rect.height, width: rect.width });
  }, []);

  return (
    <div
      aria-label="Named snapshot actions"
      className="selection-context-menu"
      ref={menuRef}
      role="menu"
      style={menuPosition}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="selection-context-header">
        <strong>{menu.item.checkpoint.name}</strong>
        <span>Named snapshot</span>
      </div>
      <button className="context-menu-item" role="menuitem" type="button" onClick={onRename}>
        <Pencil aria-hidden="true" size={16} />
        <span>Rename</span>
      </button>
      <button className="context-menu-item danger" role="menuitem" type="button" onClick={onDelete}>
        <Trash2 aria-hidden="true" size={16} />
        <span>Delete</span>
      </button>
    </div>
  );
}
