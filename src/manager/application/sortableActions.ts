import type { BrowserSnapshotView, NativeGroupId, NativeTabId, NativeWindowId } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import type { SortableWindowState } from '../view/sortableWindow';

interface TabPlacement {
  groupId: NativeGroupId;
  index: number;
  windowId: NativeWindowId;
}

export function reconcileSortableProjection(
  api: BrowserTabsApi,
  sourceView: BrowserSnapshotView,
  projectedView: BrowserSnapshotView,
  states: SortableWindowState[] = []
) {
  const commit = (scoped: BrowserTabsApi) => commitSortableProjection(scoped, sourceView, projectedView, states);
  return api.runExclusive ? api.runExclusive(commit) : commit(api);
}

async function commitSortableProjection(
  api: BrowserTabsApi,
  sourceView: BrowserSnapshotView,
  projectedView: BrowserSnapshotView,
  states: SortableWindowState[]
) {
  const sourceTabs = tabPlacements(sourceView);
  const projectedTabs = tabPlacements(projectedView);
  const focus = focusedActiveTab(sourceView);

  const wholeGroupMovedTabIds = await moveWholeGroups(api, sourceView, projectedView, explicitWholeGroupMoveIds(states));
  await updateTabGroups(api, sourceTabs, projectedTabs, wholeGroupMovedTabIds);
  await moveTabsToProjectedOrder(api, sourceView, sourceTabs, projectedView, wholeGroupMovedTabIds);
  await restoreFocusedActiveTab(api, projectedView, focus);
}

async function moveWholeGroups(
  api: BrowserTabsApi,
  sourceView: BrowserSnapshotView,
  projectedView: BrowserSnapshotView,
  wholeGroupMoveIds: ReadonlySet<NativeGroupId>
) {
  const sourceGroups = new Map(sourceView.windows.flatMap((window) => window.groupSpans.map((group) => [group.groupId, group])));
  const movedTabIds = new Set<NativeTabId>();

  for (const projectedWindow of projectedView.windows) {
    for (const projectedGroup of projectedWindow.groupSpans) {
      if (!wholeGroupMoveIds.has(projectedGroup.groupId)) {
        continue;
      }

      const sourceGroup = sourceGroups.get(projectedGroup.groupId);

      if (!sourceGroup || !sameIds(sourceGroup.tabIds, projectedGroup.tabIds)) {
        continue;
      }

      if (sourceGroup.windowId !== projectedGroup.windowId || sourceGroup.startIndex !== projectedGroup.startIndex) {
        await api.moveGroup(projectedGroup.groupId, projectedGroup.windowId, projectedGroup.startIndex);
        projectedGroup.tabIds.forEach((tabId) => movedTabIds.add(tabId));
      }
    }
  }

  return movedTabIds;
}

function explicitWholeGroupMoveIds(states: Array<{ wholeGroupMoveIds?: NativeGroupId[] }>) {
  return new Set(states.flatMap((state) => state.wholeGroupMoveIds ?? []));
}

async function updateTabGroups(
  api: BrowserTabsApi,
  sourceTabs: Map<NativeTabId, TabPlacement>,
  projectedTabs: Map<NativeTabId, TabPlacement>,
  wholeGroupMovedTabIds: ReadonlySet<NativeTabId>
) {
  const ungroupedTabs: NativeTabId[] = [];
  const groupedTabs = new Map<NativeGroupId, { windowId: NativeWindowId; tabIds: NativeTabId[]; crossWindow: boolean }>();

  for (const [tabId, projected] of projectedTabs) {
    if (wholeGroupMovedTabIds.has(tabId)) {
      continue;
    }

    const source = sourceTabs.get(tabId);

    if (!source || (source.groupId === projected.groupId && source.windowId === projected.windowId)) {
      continue;
    }

    if (projected.groupId === -1) {
      if (source.groupId !== -1) ungroupedTabs.push(tabId);
    } else {
      const batch = groupedTabs.get(projected.groupId) ?? { windowId: projected.windowId, tabIds: [], crossWindow: false };
      batch.tabIds.push(tabId);
      batch.crossWindow ||= source.windowId !== projected.windowId;
      groupedTabs.set(projected.groupId, batch);
    }
  }

  for (const [groupId, batch] of groupedTabs) {
    if (!batch.crossWindow && api.groupTabs) {
      await api.groupTabs(batch.tabIds, groupId);
    } else {
      await api.moveTabsToGroup(batch.tabIds, groupId, batch.windowId);
    }
  }

  if (ungroupedTabs.length > 0) {
    await api.ungroupTabs(ungroupedTabs);
  }
}

async function moveTabsToProjectedOrder(
  api: BrowserTabsApi,
  sourceView: BrowserSnapshotView,
  sourceTabs: Map<NativeTabId, TabPlacement>,
  projectedView: BrowserSnapshotView,
  wholeGroupMovedTabIds: ReadonlySet<NativeTabId>
) {
  const sourceGroups = new Map(sourceView.windows.flatMap((window) => window.groupSpans.map((group) => [group.groupId, group])));
  const batchMovedTabIds = new Set<NativeTabId>();

  for (const window of projectedView.windows) {
    if (!api.moveTabs) {
      continue;
    }

    for (const projectedGroup of window.groupSpans) {
      const sourceGroup = sourceGroups.get(projectedGroup.groupId);

      if (
        !sourceGroup ||
        (sourceGroup.windowId === window.id && sameIds(sourceGroup.tabIds, projectedGroup.tabIds)) ||
        projectedGroup.tabIds.some((tabId) => wholeGroupMovedTabIds.has(tabId))
      ) {
        continue;
      }

      await api.moveTabs(projectedGroup.tabIds, window.id, projectedGroup.startIndex);
      projectedGroup.tabIds.forEach((tabId) => batchMovedTabIds.add(tabId));
    }
  }

  for (const window of projectedView.windows) {
    for (const item of window.items) {
      if (wholeGroupMovedTabIds.has(item.tab.id) || batchMovedTabIds.has(item.tab.id)) {
        continue;
      }

      const source = sourceTabs.get(item.tab.id);

      if (source && samePlacement(source, item.tab)) {
        continue;
      }

      await api.moveTab(item.tab.id, window.id, item.tab.index);
    }
  }
}

function samePlacement(source: TabPlacement, projected: { groupId: NativeGroupId; index: number; windowId: NativeWindowId }) {
  return source.groupId === projected.groupId && source.index === projected.index && source.windowId === projected.windowId;
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
