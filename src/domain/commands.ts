import type { BrowserSnapshotView, BrowserTabRecord, NativeGroupId, NativeTabId, NativeWindowId } from './types';

export type CreateGroupPlan =
  | { enabled: true; windowId: NativeWindowId; tabIds: NativeTabId[] }
  | { enabled: false; reason: 'no-tabs-selected' | 'selected-tabs-span-windows' };

export type MoveToGroupPlan =
  | { enabled: true; targetGroupId: NativeGroupId; targetWindowId: NativeWindowId; tabIds: NativeTabId[] }
  | { enabled: false; reason: 'no-tabs-selected' | 'target-group-not-found' };

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
