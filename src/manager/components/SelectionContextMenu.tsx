import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderPlus, MinusCircle, Moon, Trash2 } from 'lucide-react';

import { planCreateGroup, planDiscardTabs, planMoveToGroup } from '../../domain/commands';
import type { BrowserSnapshotView, NativeGroupId, NativeTabId } from '../../domain/types';
import { useEscapeHandler } from '../hooks/useEscapeStack';
import { contextMenuPosition } from '../view/contextMenuPosition';
import { selectedTabsFromView, type GroupOption } from '../view/groupOptions';

export interface SelectionContextMenuState {
  fromSelection: boolean;
  sourceTabId?: NativeTabId;
  tabIds: NativeTabId[];
  x: number;
  y: number;
}

export function SelectionContextMenu({
  actionTabIds,
  groups,
  menu,
  onClose,
  onCloseSelected,
  onCreateGroup,
  onDiscardTabs,
  onMoveToGroup,
  onUngroup,
  view
}: {
  actionTabIds: ReadonlySet<NativeTabId>;
  groups: GroupOption[];
  menu: SelectionContextMenuState;
  onClose: () => void;
  onCloseSelected: () => void;
  onCreateGroup: () => void;
  onDiscardTabs: () => void;
  onMoveToGroup: (groupId: NativeGroupId) => void;
  onUngroup: () => void;
  view: BrowserSnapshotView;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuSize, setMenuSize] = useState({ height: 0, width: 260 });
  const createPlan = planCreateGroup(view, actionTabIds);
  const discardPlan = planDiscardTabs(view, actionTabIds);
  const hasGroupedSelection = selectedTabsFromView(view, actionTabIds).some((tab) => tab.groupId !== -1);
  const menuPosition = contextMenuPosition(menu, menuSize);

  useEffect(() => {
    const pointerListener = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', pointerListener);

    return () => {
      document.removeEventListener('pointerdown', pointerListener);
    };
  }, [onClose]);
  useEscapeHandler(
    useCallback(() => {
      onClose();
      return true;
    }, [onClose])
  );

  useEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    setMenuSize({ height: rect.height, width: rect.width });
  }, [actionTabIds.size, groups.length, menu.fromSelection]);

  return (
    <div
      aria-label="Selection actions"
      className="selection-context-menu"
      ref={menuRef}
      role="menu"
      style={menuPosition}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.fromSelection ? (
        <div className="selection-context-header">
          <strong>{actionTabIds.size} selected</strong>
          <span>Batch actions</span>
        </div>
      ) : null}
      <button
        className="context-menu-item"
        disabled={!createPlan.enabled}
        role="menuitem"
        type="button"
        onClick={onCreateGroup}
      >
        <FolderPlus aria-hidden="true" size={16} />
        <span>Create group</span>
        <small>Same window</small>
      </button>
      <button
        className="context-menu-item"
        disabled={!discardPlan.enabled}
        role="menuitem"
        type="button"
        onClick={onDiscardTabs}
      >
        <Moon aria-hidden="true" size={16} />
        <span>Release memory</span>
        <small>{discardPlan.enabled && discardPlan.skippedActiveTabCount > 0 ? `Skipped ${discardPlan.skippedActiveTabCount}` : ''}</small>
      </button>
      <button
        className="context-menu-item"
        disabled={!hasGroupedSelection}
        role="menuitem"
        type="button"
        onClick={onUngroup}
      >
        <MinusCircle aria-hidden="true" size={16} />
        <span>Remove from group</span>
      </button>
      <div className="context-menu-section" role="presentation">
        <div className="context-menu-section-title">Move to group</div>
        <div className="context-menu-group-list">
          {groups.length > 0 ? (
            groups.map((group) => {
              const movePlan = planMoveToGroup(view, actionTabIds, group.id);

              return (
                <button
                  className="context-menu-item"
                  disabled={!movePlan.enabled}
                  key={group.id}
                  role="menuitem"
                  type="button"
                  onClick={() => onMoveToGroup(group.id)}
                >
                  <span aria-hidden="true" className={`context-menu-group-swatch group-color-${group.color}`} />
                  <span>{group.title || 'Untitled group'}</span>
                  <small>Window {group.windowIndex + 1}</small>
                </button>
              );
            })
          ) : (
            <div className="context-menu-empty">No groups</div>
          )}
        </div>
      </div>
      <button className="context-menu-item danger" role="menuitem" type="button" onClick={onCloseSelected}>
        <Trash2 aria-hidden="true" size={16} />
        <span>{actionTabIds.size === 1 ? 'Close tab' : 'Close selected'}</span>
        <small>{actionTabIds.size}</small>
      </button>
    </div>
  );
}
