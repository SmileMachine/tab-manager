import { useDraggable } from '@dnd-kit/core';

import { projectTabDropInView, projectWindowRowTabPositions } from '../../domain/dragProjection';
import { selectionStateForGroup, setGroupSelection } from '../../domain/selection';
import type {
  BrowserTabGroupColor,
  NativeGroupId,
  NativeTabId,
  NativeWindowId,
  WindowView
} from '../../domain/types';
import { createWindowRows, type WindowRow } from '../../domain/windowRows';
import type { TabDropTarget } from '../../domain/commands';
import type { GroupEditMenuState } from './GroupEditPopover';
import { GroupLabel } from './GroupLabel';
import { TabListRow } from './TabListRow';
import { WindowTitle } from './WindowTitle';
import { createGroupLabels } from '../view/groupLabels';

type ActiveDropTarget = TabDropTarget | undefined;
type DragProjection = { draggedTabId: NativeTabId; target: ActiveDropTarget } | undefined;
type GroupDragProjection =
  | { draggedGroupId: NativeGroupId; offsetY: number; rowCount: number; target: ActiveDropTarget }
  | undefined;

export interface WindowSectionProps {
  activeDropTarget: ActiveDropTarget;
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  contextSourceTabId: NativeTabId | undefined;
  dragProjection: DragProjection;
  groupDragProjection: GroupDragProjection;
  index: number;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenGroupMenu: (state: GroupEditMenuState) => void;
  onOpenTabContextMenu: (event: React.MouseEvent, tabId: NativeTabId) => void;
  onSelectTab: (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  onUpdateWindowName: (windowId: NativeWindowId, name: string) => void;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
  windowName: string | undefined;
  windowView: WindowView;
}

export function WindowSection({
  activeDropTarget,
  collapsedGroupIds,
  contextSourceTabId,
  dragProjection,
  groupDragProjection,
  index,
  onActivateTab,
  onCloseTab,
  onOpenGroupMenu,
  onOpenTabContextMenu,
  onSelectTab,
  onToggleGroup,
  onUpdateWindowName,
  selectedTabIds,
  setSelectedTabIds,
  windowName,
  windowView
}: WindowSectionProps) {
  const rows = createWindowRows(windowView, collapsedGroupIds);
  const projectedWindowView =
    dragProjection?.target && windowContainsTab(rows, dragProjection.draggedTabId)
      ? projectTabDropInView({ windows: [windowView] }, dragProjection.draggedTabId, dragProjection.target).windows[0]
      : undefined;
  const projectedRows = projectedWindowView ? createWindowRows(projectedWindowView, collapsedGroupIds) : undefined;
  const labelRows = projectedRows ?? rows;
  const labelWindowView = projectedWindowView ?? windowView;
  const spansByStart = new Map(labelWindowView.groupSpans.map((span) => [span.startIndex, span]));
  const groupColors = new Map(windowView.groupSpans.map((span) => [span.groupId, span.color]));
  const projectedGroupId = projectedGroupIdFromTarget(rows, dragProjection?.target);
  const groupLabels = createGroupLabels(labelRows, spansByStart, collapsedGroupIds);
  const projectedTabPositions = projectWindowRowTabPositions(rows, dragProjection?.draggedTabId, dragProjection?.target);
  const projectedGroupRowPositions =
    groupDragProjection?.target
      ? projectGroupRowPositions(
          rows,
          groupDragProjection.draggedGroupId,
          groupDragProjection.rowCount,
          groupDragProjection.target
        )
      : undefined;
  const orderedTabIds = rows.flatMap((row) => (row.kind === 'tab' ? [row.tab.id] : []));

  return (
    <section className="window-section">
      <header className="window-header">
        <WindowTitle
          defaultName={`Window ${index + 1}`}
          name={windowName}
          onSave={(name) => onUpdateWindowName(windowView.id, name)}
        />
        <p>
          {windowView.items.length} tabs
          {windowView.focused ? <span>Focused</span> : null}
        </p>
      </header>
      <div className="tab-list" role="list">
        {groupLabels.map((label) => (
          <DraggableGroupRailItem
            collapsed={label.collapsed}
            color={label.group.color}
            group={label.group}
            key={`group-label-${label.group.groupId}`}
            rowSpan={label.rowSpan}
            rowStart={
              projectedGroupLabelRowStart(label.group, projectedGroupRowPositions) ?? label.rowStart
            }
            transformY={
              label.group.groupId === groupDragProjection?.draggedGroupId && !projectedGroupRowPositions
                ? groupDragProjection.offsetY
                : undefined
            }
            onOpenGroupMenu={onOpenGroupMenu}
            onSelectionChange={(selected) =>
              setSelectedTabIds((current) => setGroupSelection(current, label.group.tabIds, selected))
            }
            onToggleGroup={onToggleGroup}
            selectionState={selectionStateForGroup(selectedTabIds, label.group.tabIds)}
          />
        ))}
        {rows.map((row, rowIndex) => (
          <TabListRow
            activeDropTarget={activeDropTarget}
            key={row.kind === 'tab' ? `tab-${row.tab.id}` : `group-${row.groupId}`}
            onActivateTab={onActivateTab}
            onCloseTab={onCloseTab}
            onOpenTabContextMenu={onOpenTabContextMenu}
            onSelectTab={onSelectTab}
            orderedTabIds={orderedTabIds}
            row={row}
            rowColor={
              row.kind === 'tab'
                ? groupColors.get(row.tab.id === dragProjection?.draggedTabId && projectedGroupId !== undefined ? projectedGroupId : row.groupId)
                : undefined
            }
            rowIndex={
              projectedGroupRowPositions
                ? (projectedGroupRowPositions[rowKey(row)] ?? rowIndex + 1) - 1
                : row.kind === 'tab' && row.tab.id !== dragProjection?.draggedTabId
                ? (projectedTabPositions[row.tab.id] ?? rowIndex + 1) - 1
                : rowIndex
            }
            rowTransformY={
              ((row.kind === 'tab' && row.groupId === groupDragProjection?.draggedGroupId) ||
                (row.kind === 'group-summary' && row.groupId === groupDragProjection?.draggedGroupId)) &&
              !projectedGroupRowPositions
                ? groupDragProjection.offsetY
                : undefined
            }
            selectedTabIds={selectedTabIds}
            contextSourceTabId={contextSourceTabId}
            setSelectedTabIds={setSelectedTabIds}
          />
        ))}
      </div>
    </section>
  );
}

function DraggableGroupRailItem({
  collapsed,
  color,
  group,
  onOpenGroupMenu,
  onSelectionChange,
  onToggleGroup,
  rowSpan,
  rowStart,
  selectionState,
  transformY
}: {
  collapsed: boolean;
  color: BrowserTabGroupColor;
  group: Parameters<typeof GroupLabel>[0]['group'];
  onOpenGroupMenu: (state: GroupEditMenuState) => void;
  onSelectionChange: (selected: boolean) => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  rowSpan: number;
  rowStart: number;
  selectionState: 'unchecked' | 'mixed' | 'checked';
  transformY?: number;
}) {
  const draggable = useDraggable({
    id: draggableGroupId(group.groupId),
    data: { kind: 'group-drag', groupId: group.groupId }
  });
  const transform = yOnlyTransform(transformY ?? draggable.transform?.y);

  return (
    <div
      className={`group-rail-item group-color-${color} ${draggable.isDragging ? 'is-dragging' : ''}`}
      ref={draggable.setNodeRef}
      style={{ gridRow: `${rowStart} / span ${rowSpan}`, transform }}
    >
      <GroupLabel
        collapsed={collapsed}
        dragAttributes={draggable.attributes}
        dragListeners={draggable.listeners}
        group={group}
        onOpenMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenGroupMenu({ group, x: event.clientX, y: event.clientY });
        }}
        onSelectionChange={onSelectionChange}
        onToggle={onToggleGroup}
        selectionState={selectionState}
      />
    </div>
  );
}

function draggableGroupId(groupId: NativeGroupId) {
  return `group:${groupId}`;
}

function yOnlyTransform(offsetY: number | undefined) {
  return offsetY === undefined ? undefined : `translate3d(0px, ${offsetY}px, 0)`;
}

function windowContainsTab(rows: WindowRow[], tabId: NativeTabId) {
  return rows.some((row) => row.kind === 'tab' && row.tab.id === tabId);
}

function projectedGroupIdFromTarget(rows: WindowRow[], target: ActiveDropTarget): NativeGroupId | undefined {
  if (!target) {
    return undefined;
  }

  if (target.kind === 'group') {
    return target.groupId;
  }

  return rows.find((row) => row.kind === 'tab' && row.tab.id === target.tabId)?.groupId;
}

function projectGroupRowPositions(
  rows: WindowRow[],
  draggedGroupId: NativeGroupId,
  draggedRowCount: number,
  target: ActiveDropTarget
): Record<string, number> {
  const projectedOrder = projectGroupRowOrder(rows, draggedGroupId, draggedRowCount, target);
  const positions: Record<string, number> = {};

  for (const [index, key] of projectedOrder.entries()) {
    positions[key] = index + 1;
  }

  return positions;
}

function projectGroupRowOrder(
  rows: WindowRow[],
  draggedGroupId: NativeGroupId,
  draggedRowCount: number,
  target: ActiveDropTarget
) {
  const rowKeys = rows.map(rowKey);

  if (!target || target.kind === 'group' || draggedRowCount <= 0) {
    return rowKeys;
  }

  const draggedKeys = rows.filter((row) => row.groupId === draggedGroupId).map(rowKey);

  if (target.kind === 'tab') {
    const targetRow = rows.find((row) => row.kind === 'tab' && row.tab.id === target.tabId);

    if (!targetRow) {
      return draggedKeys.length > 0 ? rows.filter((row) => row.groupId !== draggedGroupId).map(rowKey) : rowKeys;
    }

    if (targetRow.groupId === draggedGroupId) {
      return rowKeys;
    }

    const rowsWithoutDragged = rows.filter((row) => row.groupId !== draggedGroupId);
    const targetGroupId = targetRow.groupId;
    const insertedKeys = draggedKeys.length > 0 ? draggedKeys : virtualDraggedRowKeys(draggedGroupId, draggedRowCount);
    const insertIndex =
      targetGroupId === -1
        ? indexForUngroupedTarget(rowsWithoutDragged, target.tabId, target.position)
        : indexForGroupedTarget(rowsWithoutDragged, targetGroupId, target.position);

    const keysWithoutDragged = rowsWithoutDragged.map(rowKey);
    return [...keysWithoutDragged.slice(0, insertIndex), ...insertedKeys, ...keysWithoutDragged.slice(insertIndex)];
  }

  return rowKeys;
}

function virtualDraggedRowKeys(draggedGroupId: NativeGroupId, rowCount: number) {
  return Array.from({ length: rowCount }, (_, index) => `dragged-group:${draggedGroupId}:${index}`);
}

function indexForUngroupedTarget(rows: WindowRow[], targetTabId: NativeTabId, position: 'before' | 'after') {
  const targetIndex = rows.findIndex((row) => row.kind === 'tab' && row.tab.id === targetTabId);

  if (targetIndex === -1) {
    return rows.length;
  }

  return position === 'before' ? targetIndex : targetIndex + 1;
}

function indexForGroupedTarget(rows: WindowRow[], targetGroupId: NativeGroupId, position: 'before' | 'after') {
  const groupIndexes = rows.flatMap((row, index) => (row.groupId === targetGroupId ? [index] : []));

  if (groupIndexes.length === 0) {
    return rows.length;
  }

  return position === 'before' ? groupIndexes[0] : groupIndexes[groupIndexes.length - 1] + 1;
}

function projectedGroupLabelRowStart(
  group: Parameters<typeof GroupLabel>[0]['group'],
  positions: Record<string, number> | undefined
) {
  if (!positions) {
    return undefined;
  }

  const rowStarts =
    'kind' in group
      ? [positions[`group-summary:${group.groupId}`]].flatMap((rowStart) => rowStart ?? [])
      : group.tabIds.flatMap((tabId) => positions[`tab:${tabId}`] ?? []);

  return rowStarts.length > 0 ? Math.min(...rowStarts) : undefined;
}

function rowKey(row: WindowRow) {
  return row.kind === 'tab' ? `tab:${row.tab.id}` : `group-summary:${row.groupId}`;
}
