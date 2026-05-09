import type { BrowserSnapshotView, BrowserTabRecord, NativeGroupId, NativeTabId, NativeWindowId } from './types';

export type CreateGroupPlan =
  | { enabled: true; windowId: NativeWindowId; tabIds: NativeTabId[] }
  | { enabled: false; reason: 'no-tabs-selected' | 'selected-tabs-span-windows' };

export type MoveToGroupPlan =
  | { enabled: true; targetGroupId: NativeGroupId; targetWindowId: NativeWindowId; tabIds: NativeTabId[] }
  | { enabled: false; reason: 'no-tabs-selected' | 'target-group-not-found' };

export type TabDropTarget =
  | { kind: 'tab'; tabId: NativeTabId; position: 'before' | 'after' }
  | { kind: 'group'; groupId: NativeGroupId };

export type TabDropPlan =
  | {
      enabled: true;
      move: { tabId: NativeTabId; windowId: NativeWindowId; index: number };
      group?: { kind: 'join'; groupId: NativeGroupId } | { kind: 'ungroup' };
    }
  | { enabled: false; reason: 'dragged-tab-not-found' | 'target-not-found' | 'same-tab' };

export interface BulkCloseSummary {
  tabCount: number;
  windowCount: number;
  containsPinnedTabs: boolean;
  exampleTitles: string[];
}

export function planCreateGroup(view: BrowserSnapshotView, selectedTabIds: ReadonlySet<NativeTabId>): CreateGroupPlan {
  const selectedTabs = selectedTabsInViewOrder(view, selectedTabIds);

  if (selectedTabs.length === 0) {
    return { enabled: false, reason: 'no-tabs-selected' };
  }

  const windowIds = new Set(selectedTabs.map((tab) => tab.windowId));

  if (windowIds.size !== 1) {
    return { enabled: false, reason: 'selected-tabs-span-windows' };
  }

  return {
    enabled: true,
    windowId: selectedTabs[0].windowId,
    tabIds: selectedTabs.map((tab) => tab.id)
  };
}

export function nextNewGroupTitle(view: BrowserSnapshotView): string {
  const nextNumber =
    Math.max(
      0,
      ...view.windows.flatMap((window) =>
        window.groupSpans.flatMap((group) => {
          const match = /^New Group (\d+)$/.exec(group.title ?? '');
          return match ? [Number(match[1])] : [];
        })
      )
    ) + 1;

  return `New Group ${nextNumber}`;
}

export function planMoveToGroup(
  view: BrowserSnapshotView,
  selectedTabIds: ReadonlySet<NativeTabId>,
  targetGroupId: NativeGroupId
): MoveToGroupPlan {
  const selectedTabs = selectedTabsInViewOrder(view, selectedTabIds);

  if (selectedTabs.length === 0) {
    return { enabled: false, reason: 'no-tabs-selected' };
  }

  const targetGroup = view.windows.flatMap((window) => window.groupSpans).find((group) => group.groupId === targetGroupId);

  if (!targetGroup) {
    return { enabled: false, reason: 'target-group-not-found' };
  }

  return {
    enabled: true,
    targetGroupId,
    targetWindowId: targetGroup.windowId,
    tabIds: selectedTabs.map((tab) => tab.id)
  };
}

export function planTabDrop(view: BrowserSnapshotView, draggedTabId: NativeTabId, target: TabDropTarget): TabDropPlan {
  const dragged = findTabPlacement(view, draggedTabId);

  if (!dragged) {
    return { enabled: false, reason: 'dragged-tab-not-found' };
  }

  if (target.kind === 'tab') {
    const targetTab = findTabPlacement(view, target.tabId);

    if (!targetTab) {
      return { enabled: false, reason: 'target-not-found' };
    }

    if (dragged.tab.id === targetTab.tab.id) {
      return { enabled: false, reason: 'same-tab' };
    }

    return {
      enabled: true,
      move: {
        tabId: dragged.tab.id,
        windowId: targetTab.tab.windowId,
        index: destinationIndexForTabDrop(dragged.tab, targetTab.tab, target.position)
      },
      group: groupActionForDrop(dragged.tab.groupId, targetTab.tab.groupId)
    };
  }

  const targetGroup = view.windows.flatMap((window) => window.groupSpans).find((group) => group.groupId === target.groupId);

  if (!targetGroup) {
    return { enabled: false, reason: 'target-not-found' };
  }

  return {
    enabled: true,
    move: {
      tabId: dragged.tab.id,
      windowId: targetGroup.windowId,
      index: destinationIndexForGroupDrop(dragged.tab, targetGroup)
    },
    group: dragged.tab.groupId === targetGroup.groupId ? undefined : { kind: 'join', groupId: targetGroup.groupId }
  };
}

export function createBulkCloseSummary(
  view: BrowserSnapshotView,
  selectedTabIds: ReadonlySet<NativeTabId>
): BulkCloseSummary {
  const selectedTabs = selectedTabsInViewOrder(view, selectedTabIds);

  return {
    tabCount: selectedTabs.length,
    windowCount: new Set(selectedTabs.map((tab) => tab.windowId)).size,
    containsPinnedTabs: selectedTabs.some((tab) => tab.pinned),
    exampleTitles: selectedTabs.slice(0, 5).map((tab) => tab.title)
  };
}

function selectedTabsInViewOrder(view: BrowserSnapshotView, selectedTabIds: ReadonlySet<NativeTabId>): BrowserTabRecord[] {
  return view.windows.flatMap((window) =>
    window.items
      .map((item) => item.tab)
      .filter((tab) => selectedTabIds.has(tab.id))
      .sort((left, right) => left.index - right.index)
  );
}

function findTabPlacement(view: BrowserSnapshotView, tabId: NativeTabId) {
  for (const window of view.windows) {
    const itemIndex = window.items.findIndex((item) => item.tab.id === tabId);

    if (itemIndex !== -1) {
      return { window, tab: window.items[itemIndex].tab, itemIndex };
    }
  }

  return undefined;
}

function destinationIndexForTabDrop(
  draggedTab: BrowserTabRecord,
  targetTab: BrowserTabRecord,
  position: 'before' | 'after'
) {
  const baseIndex = position === 'before' ? targetTab.index : targetTab.index + 1;

  if (draggedTab.windowId !== targetTab.windowId) {
    return baseIndex;
  }

  if (draggedTab.index < targetTab.index) {
    return Math.max(0, baseIndex - 1);
  }

  return baseIndex;
}

function groupActionForDrop(sourceGroupId: NativeGroupId, targetGroupId: NativeGroupId) {
  if (sourceGroupId === targetGroupId) {
    return undefined;
  }

  return targetGroupId === -1 ? { kind: 'ungroup' as const } : { kind: 'join' as const, groupId: targetGroupId };
}

function destinationIndexForGroupDrop(draggedTab: BrowserTabRecord, targetGroup: { windowId: NativeWindowId; endIndex: number }) {
  const baseIndex = targetGroup.endIndex + 1;

  if (draggedTab.windowId === targetGroup.windowId && draggedTab.index <= targetGroup.endIndex) {
    return Math.max(0, baseIndex - 1);
  }

  return baseIndex;
}
