import type { TabDropTarget } from './commands';
import type { BrowserSnapshotView, NativeGroupId, NativeTabId, WindowView } from './types';
import type { WindowRow } from './windowRows';
import { createBrowserSnapshotView } from './snapshot';

export function projectWindowRowTabOrder(
  rows: WindowRow[],
  draggedTabId: NativeTabId | undefined,
  target: TabDropTarget | undefined
): NativeTabId[] {
  const tabRows = rows.filter((row): row is Extract<WindowRow, { kind: 'tab' }> => row.kind === 'tab');
  const tabIds = tabRows.map((row) => row.tab.id);

  if (!draggedTabId || !target || !tabIds.includes(draggedTabId)) {
    return tabIds;
  }

  if (target.kind === 'tab') {
    return moveTabId(tabIds, draggedTabId, target.tabId, target.position);
  }

  const lastGroupTab = [...tabRows].reverse().find((row) => row.groupId === target.groupId);

  if (!lastGroupTab) {
    return tabIds;
  }

  return moveTabId(tabIds, draggedTabId, lastGroupTab.tab.id, 'after');
}

export function projectWindowRowTabPositions(
  rows: WindowRow[],
  draggedTabId: NativeTabId | undefined,
  target: TabDropTarget | undefined
): Record<NativeTabId, number> {
  const tabRows = rows.flatMap((row, rowIndex) => (row.kind === 'tab' ? [{ row, rowNumber: rowIndex + 1 }] : []));
  const rowSlots = tabRows.map((item) => item.rowNumber);
  const projectedOrder = projectWindowRowTabOrder(rows, draggedTabId, target);
  const positions: Record<NativeTabId, number> = {};

  for (const [index, tabId] of projectedOrder.entries()) {
    positions[tabId] = rowSlots[index];
  }

  return positions;
}

export function projectTabDropInView(
  view: BrowserSnapshotView,
  draggedTabId: NativeTabId,
  target: TabDropTarget
): BrowserSnapshotView {
  const sourceWindow = view.windows.find((window) => window.items.some((item) => item.tab.id === draggedTabId));
  const targetWindow = targetWindowForDrop(view, target);

  if (!sourceWindow || !targetWindow) {
    return view;
  }

  const draggedItem = sourceWindow.items.find((item) => item.tab.id === draggedTabId);

  if (!draggedItem) {
    return view;
  }

  const targetGroupId = targetGroupIdForDrop(targetWindow, target);
  const nextWindows = view.windows.map((window) => {
    const itemsWithoutDragged = window.items.filter((item) => item.tab.id !== draggedTabId);

    if (window.id !== targetWindow.id) {
      return { ...window, items: itemsWithoutDragged };
    }

    const insertIndex = insertIndexForDrop(itemsWithoutDragged, target);
    const nextItem = {
      ...draggedItem,
      tab: {
        ...draggedItem.tab,
        windowId: window.id,
        groupId: targetGroupId
      },
      group: targetGroupId === -1 ? undefined : targetWindow.items.find((item) => item.tab.groupId === targetGroupId)?.group
    };
    const nextItems = [...itemsWithoutDragged.slice(0, insertIndex), nextItem, ...itemsWithoutDragged.slice(insertIndex)].map(
      (item, index) => ({
        ...item,
        tab: {
          ...item.tab,
          index
        }
      })
    );

    return { ...window, items: nextItems };
  });

  const groupsById = new Map(view.windows.flatMap((window) => window.groupSpans.map((span) => [span.groupId, span])));

  return createBrowserSnapshotView({
    windows: nextWindows.map((window) => ({
      id: window.id,
      focused: window.focused,
      type: window.type
    })),
    tabs: nextWindows.flatMap((window) => window.items.map((item) => item.tab)),
    groups: [...groupsById.values()].map((group) => ({
      id: group.groupId,
      windowId: group.windowId,
      title: group.title,
      color: group.color,
      collapsed: false
    }))
  });
}

function moveTabId(
  tabIds: NativeTabId[],
  draggedTabId: NativeTabId,
  targetTabId: NativeTabId,
  position: 'before' | 'after'
) {
  if (draggedTabId === targetTabId) {
    return tabIds;
  }

  const withoutDragged = tabIds.filter((tabId) => tabId !== draggedTabId);
  const targetIndex = withoutDragged.indexOf(targetTabId);

  if (targetIndex === -1) {
    return tabIds;
  }

  const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
  return [...withoutDragged.slice(0, insertIndex), draggedTabId, ...withoutDragged.slice(insertIndex)];
}

function targetWindowForDrop(view: BrowserSnapshotView, target: TabDropTarget): WindowView | undefined {
  if (target.kind === 'group') {
    return view.windows.find((window) => window.groupSpans.some((group) => group.groupId === target.groupId));
  }

  return view.windows.find((window) => window.items.some((item) => item.tab.id === target.tabId));
}

function targetGroupIdForDrop(window: WindowView, target: TabDropTarget): NativeGroupId {
  if (target.kind === 'group') {
    return target.groupId;
  }

  return window.items.find((item) => item.tab.id === target.tabId)?.tab.groupId ?? -1;
}

function insertIndexForDrop(itemsWithoutDragged: WindowView['items'], target: TabDropTarget) {
  if (target.kind === 'group') {
    const lastGroupIndex = [...itemsWithoutDragged]
      .reverse()
      .findIndex((item) => item.tab.groupId === target.groupId);

    if (lastGroupIndex === -1) {
      return itemsWithoutDragged.length;
    }

    return itemsWithoutDragged.length - lastGroupIndex;
  }

  const targetIndex = itemsWithoutDragged.findIndex((item) => item.tab.id === target.tabId);

  if (targetIndex === -1) {
    return itemsWithoutDragged.length;
  }

  return target.position === 'before' ? targetIndex : targetIndex + 1;
}
