import { useDraggable, useDroppable, type DraggableAttributes } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';

import type { TabDropTarget } from '../../domain/commands';
import type { BrowserTabGroupColor, NativeGroupId, NativeTabId, NativeWindowId } from '../../domain/types';
import type { WindowRow } from '../../domain/windowRows';
import { faviconUrlForPage } from '../view/faviconUrl';
import { domainFromUrl } from '../view/url';
import { GroupSummaryRow } from './GroupSummaryRow';

type DraggableListeners = ReturnType<typeof useDraggable>['listeners'];
type ActiveDropTarget = TabDropTarget | undefined;

export interface TabListRowProps {
  activeDropTarget: ActiveDropTarget;
  contextSourceTabId: NativeTabId | undefined;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenTabContextMenu: (event: React.MouseEvent, tabId: NativeTabId) => void;
  onSelectTab: (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => void;
  orderedTabIds: NativeTabId[];
  row: WindowRow;
  rowColor?: BrowserTabGroupColor;
  rowIndex: number;
  rowTransformY?: number;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
}

export function TabListRow({
  activeDropTarget,
  contextSourceTabId,
  onActivateTab,
  onCloseTab,
  onOpenTabContextMenu,
  onSelectTab,
  orderedTabIds,
  row,
  rowColor,
  rowIndex,
  rowTransformY,
  selectedTabIds,
  setSelectedTabIds
}: TabListRowProps) {
  if (row.kind === 'tab') {
    return (
      <DraggableTabListRow
        activeDropTarget={activeDropTarget}
        contextSourceTabId={contextSourceTabId}
        onActivateTab={onActivateTab}
        onCloseTab={onCloseTab}
        onOpenTabContextMenu={onOpenTabContextMenu}
        onSelectTab={onSelectTab}
        orderedTabIds={orderedTabIds}
        row={row}
        rowColor={rowColor}
        rowIndex={rowIndex}
        rowTransformY={rowTransformY}
        selectedTabIds={selectedTabIds}
        setSelectedTabIds={setSelectedTabIds}
      />
    );
  }

  return <DroppableGroupSummaryListRow activeDropTarget={activeDropTarget} row={row} rowIndex={rowIndex} rowTransformY={rowTransformY} />;
}

function DraggableTabListRow({
  activeDropTarget,
  contextSourceTabId,
  onActivateTab,
  onCloseTab,
  onOpenTabContextMenu,
  onSelectTab,
  orderedTabIds,
  row,
  rowColor,
  rowIndex,
  rowTransformY,
  selectedTabIds
}: Omit<TabListRowProps, 'row'> & { row: Extract<WindowRow, { kind: 'tab' }> }) {
  const draggable = useDraggable({
    id: draggableTabId(row.tab.id),
    data: { kind: 'tab', tabId: row.tab.id }
  });
  const droppable = useDroppable({
    id: droppableTabId(row.tab.id),
    data: { kind: 'tab', tabId: row.tab.id }
  });
  const transform = rowTransformY === undefined ? CSS.Translate.toString(draggable.transform) : yOnlyTransform(rowTransformY);
  const dropClassName = dropClassForRow(row, activeDropTarget);
  const groupDragClassName = rowTransformY === undefined ? '' : 'is-group-dragging';

  return (
    <div
      className={`tab-grid-row ${rowColor ? `group-color-${rowColor}` : ''} ${dropClassName} ${
        contextSourceTabId === row.tab.id ? 'is-context-source' : ''
      } ${draggable.isDragging ? 'is-dragging' : ''} ${groupDragClassName}`}
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      role="listitem"
      style={{ gridRow: rowIndex + 1, transform }}
    >
      <TabRow
        dragAttributes={draggable.attributes}
        dragListeners={draggable.listeners}
        row={row}
        selected={selectedTabIds.has(row.tab.id)}
        onActivate={() => onActivateTab(row.tab.id, row.tab.windowId)}
        onClose={() => onCloseTab(row.tab.id)}
        onContextMenu={(event) => onOpenTabContextMenu(event, row.tab.id)}
        onToggle={(event) => onSelectTab(row.tab.id, orderedTabIds, 'shiftKey' in event && event.shiftKey)}
      />
    </div>
  );
}

function DroppableGroupSummaryListRow({
  activeDropTarget,
  row,
  rowIndex,
  rowTransformY
}: {
  activeDropTarget: ActiveDropTarget;
  row: Extract<WindowRow, { kind: 'group-summary' }>;
  rowIndex: number;
  rowTransformY?: number;
}) {
  const droppable = useDroppable({
    id: droppableGroupId(row.groupId),
    data: { kind: 'group', groupId: row.groupId }
  });
  const dropClassName = dropClassForRow(row, activeDropTarget);
  const groupDragClassName = rowTransformY === undefined ? '' : 'is-group-dragging';

  return (
    <div
      className={`tab-grid-row group-color-${row.color} ${dropClassName} ${groupDragClassName}`}
      ref={droppable.setNodeRef}
      role="listitem"
      style={{ gridRow: rowIndex + 1, transform: yOnlyTransform(rowTransformY) }}
    >
      <GroupSummaryRow row={row} />
    </div>
  );
}

function TabRow({
  dragAttributes,
  dragListeners,
  onActivate,
  onToggle,
  onClose,
  onContextMenu,
  row,
  selected
}: {
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableListeners;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onToggle: (event: React.MouseEvent) => void;
  row: Extract<WindowRow, { kind: 'tab' }>;
  selected: boolean;
}) {
  const faviconUrl = faviconUrlForPage(row.tab.url);

  return (
    <div
      className="tab-row"
      onClick={(event) => onToggle(event)}
      onContextMenu={onContextMenu}
      {...dragAttributes}
      {...dragListeners}
    >
      <input
        aria-label={`Select ${row.tab.title}`}
        checked={selected}
        className="selection-checkbox"
        type="checkbox"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(event);
        }}
        onChange={() => undefined}
      />
      <button
        aria-label={`Go to ${row.tab.title}`}
        className="favicon"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onActivate();
        }}
      >
        {faviconUrl ? <img alt="" src={faviconUrl} /> : null}
      </button>
      <div className="tab-text">
        <strong>{row.tab.title}</strong>
        <span className="tab-url-full">{row.tab.url || 'No URL'}</span>
        <span className="tab-url-short">{domainFromUrl(row.tab.url) || row.tab.url || 'No URL'}</span>
      </div>
      {row.tab.pinned ? <span className="status-pill">Pinned</span> : null}
      <button
        aria-label={`Close ${row.tab.title}`}
        className="row-action icon-button"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

function draggableTabId(tabId: NativeTabId) {
  return `tab:${tabId}`;
}

function yOnlyTransform(offsetY: number | undefined) {
  return offsetY === undefined ? undefined : `translate3d(0px, ${offsetY}px, 0)`;
}

function droppableTabId(tabId: NativeTabId) {
  return `drop-tab:${tabId}`;
}

function droppableGroupId(groupId: NativeGroupId) {
  return `drop-group:${groupId}`;
}

function dropClassForRow(row: WindowRow, target: ActiveDropTarget) {
  return row.kind === 'group-summary' && target?.kind === 'group' && row.groupId === target.groupId ? 'drop-into' : '';
}
