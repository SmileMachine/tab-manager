import type { BrowserSnapshotView, NativeGroupId, NativeTabId, NativeWindowId } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';

interface TabPlacement {
  groupId: NativeGroupId;
  index: number;
  windowId: NativeWindowId;
}

export async function reconcileSortableProjection(
  api: BrowserTabsApi,
  sourceView: BrowserSnapshotView,
  projectedView: BrowserSnapshotView
) {
  const sourceTabs = tabPlacements(sourceView);
  const projectedTabs = tabPlacements(projectedView);
  const focus = focusedActiveTab(sourceView);

  await moveWholeGroups(api, sourceView, projectedView);
  await updateTabGroups(api, sourceTabs, projectedTabs);
  await moveTabsToProjectedOrder(api, projectedView);
  await restoreFocusedActiveTab(api, projectedView, focus);
}

async function moveWholeGroups(
  api: BrowserTabsApi,
  sourceView: BrowserSnapshotView,
  projectedView: BrowserSnapshotView
) {
  const sourceGroups = new Map(sourceView.windows.flatMap((window) => window.groupSpans.map((group) => [group.groupId, group])));

  for (const projectedWindow of projectedView.windows) {
    for (const projectedGroup of projectedWindow.groupSpans) {
      const sourceGroup = sourceGroups.get(projectedGroup.groupId);

      if (!sourceGroup || !sameIds(sourceGroup.tabIds, projectedGroup.tabIds)) {
        continue;
      }

      if (sourceGroup.windowId !== projectedGroup.windowId || sourceGroup.startIndex !== projectedGroup.startIndex) {
        await api.moveGroup(projectedGroup.groupId, projectedGroup.windowId, projectedGroup.startIndex);
      }
    }
  }
}

async function updateTabGroups(
  api: BrowserTabsApi,
  sourceTabs: Map<NativeTabId, TabPlacement>,
  projectedTabs: Map<NativeTabId, TabPlacement>
) {
  const ungroupedTabs: NativeTabId[] = [];

  for (const [tabId, projected] of projectedTabs) {
    const source = sourceTabs.get(tabId);

    if (!source || source.groupId === projected.groupId) {
      continue;
    }

    if (projected.groupId === -1) {
      ungroupedTabs.push(tabId);
    } else {
      await api.moveTabToGroup(tabId, projected.groupId);
    }
  }

  if (ungroupedTabs.length > 0) {
    await api.ungroupTabs(ungroupedTabs);
  }
}

async function moveTabsToProjectedOrder(api: BrowserTabsApi, projectedView: BrowserSnapshotView) {
  for (const window of projectedView.windows) {
    for (const item of window.items) {
      await api.moveTab(item.tab.id, window.id, item.tab.index);
    }
  }
}

function tabPlacements(view: BrowserSnapshotView) {
  return new Map(
    view.windows.flatMap((window) =>
      window.items.map((item) => [
        item.tab.id,
        { groupId: item.tab.groupId, index: item.tab.index, windowId: item.tab.windowId }
      ])
    )
  );
}

function sameIds(left: NativeTabId[], right: NativeTabId[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function focusedActiveTab(view: BrowserSnapshotView) {
  const focusedWindow = view.windows.find((window) => window.focused);
  const activeTab = focusedWindow?.items.find((item) => item.tab.active)?.tab;

  return activeTab ? { tabId: activeTab.id } : undefined;
}

async function restoreFocusedActiveTab(
  api: BrowserTabsApi,
  projectedView: BrowserSnapshotView,
  focus: { tabId: NativeTabId } | undefined
) {
  if (!focus) {
    return;
  }

  const projectedTab = projectedView.windows.flatMap((window) => window.items).find((item) => item.tab.id === focus.tabId)?.tab;

  if (!projectedTab) {
    return;
  }

  await api.activateTab(projectedTab.id, projectedTab.windowId);
}
