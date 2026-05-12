import type { BrowserSnapshotView, NativeGroupId, NativeTabId, NativeWindowId, WindowView } from '../../domain/types';
import { sameBrowserViewLayout } from './browserSync';

export type BrowserViewPatch =
  | { kind: 'no-change' }
  | { kind: 'confirm-optimistic'; operationId: string }
  | { kind: 'content-update'; tabIds: NativeTabId[]; view: BrowserSnapshotView }
  | { kind: 'insert-tabs'; tabIds: NativeTabId[]; view: BrowserSnapshotView }
  | { kind: 'remove-tabs'; tabIds: NativeTabId[]; view: BrowserSnapshotView }
  | { kind: 'move-tabs'; tabIds: NativeTabId[]; view: BrowserSnapshotView }
  | { kind: 'group-metadata-update'; groupIds: NativeGroupId[]; view: BrowserSnapshotView }
  | { kind: 'window-structure-update'; windowIds: NativeWindowId[]; view: BrowserSnapshotView }
  | { kind: 'replace'; reason: string; view: BrowserSnapshotView };

export interface ClassifyBrowserViewPatchInput {
  currentView: BrowserSnapshotView;
  expectedView?: BrowserSnapshotView;
  nextView: BrowserSnapshotView;
  operationId?: string;
}

export function classifyBrowserViewPatch({
  currentView,
  expectedView,
  nextView,
  operationId
}: ClassifyBrowserViewPatchInput): BrowserViewPatch {
  if (hasDuplicateTabIds(nextView)) {
    return { kind: 'replace', reason: 'duplicate-tab-id', view: nextView };
  }

  const expectedLayoutMatched = Boolean(expectedView && sameBrowserViewLayout(expectedView, nextView));
  const changedGroupIds = changedGroupMetadataIds(currentView, nextView);
  const changedContentTabIds = changedTabContentIds(currentView, nextView);

  if (expectedLayoutMatched && changedGroupIds.length === 0 && changedContentTabIds.length === 0 && operationId) {
    return { kind: 'confirm-optimistic', operationId };
  }

  const changedWindowIds = symmetricDifference(windowIds(currentView), windowIds(nextView));

  if (changedWindowIds.length > 0) {
    return { kind: 'window-structure-update', view: nextView, windowIds: changedWindowIds };
  }

  if (sameBrowserViewLayout(currentView, nextView)) {
    if (changedGroupIds.length > 0) {
      return { groupIds: changedGroupIds, kind: 'group-metadata-update', view: nextView };
    }

    if (changedContentTabIds.length > 0) {
      return { kind: 'content-update', tabIds: changedContentTabIds, view: nextView };
    }

    return { kind: 'no-change' };
  }

  const currentTabIds = tabIds(currentView);
  const nextTabIds = tabIds(nextView);
  const insertedTabIds = difference(nextTabIds, currentTabIds);
  const removedTabIds = difference(currentTabIds, nextTabIds);

  if (insertedTabIds.length > 0 && removedTabIds.length === 0) {
    return { kind: 'insert-tabs', tabIds: insertedTabIds, view: nextView };
  }

  if (removedTabIds.length > 0 && insertedTabIds.length === 0) {
    return { kind: 'remove-tabs', tabIds: removedTabIds, view: nextView };
  }

  if (insertedTabIds.length > 0 || removedTabIds.length > 0) {
    return { kind: 'replace', reason: 'mixed-tab-identity-change', view: nextView };
  }

  return { kind: 'move-tabs', tabIds: movedTabIds(currentView, nextView), view: nextView };
}

export function applyBrowserViewPatch(currentView: BrowserSnapshotView, patch: BrowserViewPatch): BrowserSnapshotView {
  switch (patch.kind) {
    case 'no-change':
    case 'confirm-optimistic':
      return currentView;
    case 'content-update':
      return applyTabContentUpdate(currentView, patch.view, new Set(patch.tabIds));
    case 'group-metadata-update':
      return applyGroupMetadataUpdate(currentView, patch.view, new Set(patch.groupIds));
    case 'insert-tabs':
    case 'remove-tabs':
    case 'move-tabs':
      return replaceAffectedWindows(currentView, patch.view, affectedWindowIds(currentView, patch.view));
    case 'replace':
    case 'window-structure-update':
      return patch.view;
  }
}

function hasDuplicateTabIds(view: BrowserSnapshotView) {
  const seen = new Set<NativeTabId>();

  for (const tabId of tabIds(view)) {
    if (seen.has(tabId)) {
      return true;
    }

    seen.add(tabId);
  }

  return false;
}

function windowIds(view: BrowserSnapshotView) {
  return view.windows.map((window) => window.id);
}

function tabIds(view: BrowserSnapshotView) {
  return view.windows.flatMap((window) => window.items.map((item) => item.tab.id));
}

function changedTabContentIds(currentView: BrowserSnapshotView, nextView: BrowserSnapshotView) {
  const currentTabs = new Map(currentView.windows.flatMap((window) => window.items.map((item) => [item.tab.id, item.tab])));
  const changed: NativeTabId[] = [];

  for (const tab of nextView.windows.flatMap((window) => window.items.map((item) => item.tab))) {
    const currentTab = currentTabs.get(tab.id);

    if (currentTab && !sameTabContent(currentTab, tab)) {
      changed.push(tab.id);
    }
  }

  return changed;
}

function changedGroupMetadataIds(currentView: BrowserSnapshotView, nextView: BrowserSnapshotView) {
  const currentGroups = new Map(currentView.windows.flatMap((window) => window.groupSpans.map((group) => [group.groupId, group])));
  const changed: NativeGroupId[] = [];

  for (const group of nextView.windows.flatMap((window) => window.groupSpans)) {
    const currentGroup = currentGroups.get(group.groupId);

    if (currentGroup && !sameGroupMetadata(currentGroup, group)) {
      changed.push(group.groupId);
    }
  }

  return changed;
}

function applyTabContentUpdate(
  currentView: BrowserSnapshotView,
  nextView: BrowserSnapshotView,
  changedTabIds: ReadonlySet<NativeTabId>
): BrowserSnapshotView {
  let changed = false;
  const windows = currentView.windows.map((currentWindow) => {
    if (!currentWindow.items.some((item) => changedTabIds.has(item.tab.id))) {
      return currentWindow;
    }

    const nextWindow = nextView.windows.find((window) => window.id === currentWindow.id);

    if (!nextWindow) {
      return currentWindow;
    }

    const nextItemsById = new Map(nextWindow.items.map((item) => [item.tab.id, item]));
    const items = currentWindow.items.map((currentItem) => {
      if (!changedTabIds.has(currentItem.tab.id)) {
        return currentItem;
      }

      return nextItemsById.get(currentItem.tab.id) ?? currentItem;
    });

    changed = true;
    return { ...currentWindow, focused: nextWindow.focused, items, type: nextWindow.type };
  });

  return changed ? { windows } : currentView;
}

function applyGroupMetadataUpdate(
  currentView: BrowserSnapshotView,
  nextView: BrowserSnapshotView,
  changedGroupIds: ReadonlySet<NativeGroupId>
): BrowserSnapshotView {
  let changed = false;
  const windows = currentView.windows.map((currentWindow) => {
    if (!currentWindow.groupSpans.some((group) => changedGroupIds.has(group.groupId))) {
      return currentWindow;
    }

    const nextWindow = nextView.windows.find((window) => window.id === currentWindow.id);

    if (!nextWindow) {
      return currentWindow;
    }

    const nextGroupsById = new Map(nextWindow.groupSpans.map((group) => [group.groupId, group]));
    const nextItemsById = new Map(nextWindow.items.map((item) => [item.tab.id, item]));
    const groupSpans = currentWindow.groupSpans.map((currentGroup) =>
      changedGroupIds.has(currentGroup.groupId) ? nextGroupsById.get(currentGroup.groupId) ?? currentGroup : currentGroup
    );
    const items = currentWindow.items.map((currentItem) =>
      changedGroupIds.has(currentItem.tab.groupId) ? nextItemsById.get(currentItem.tab.id) ?? currentItem : currentItem
    );

    changed = true;
    return { ...currentWindow, groupSpans, items };
  });

  return changed ? { windows } : currentView;
}

function replaceAffectedWindows(
  currentView: BrowserSnapshotView,
  nextView: BrowserSnapshotView,
  affectedWindowIds: ReadonlySet<NativeWindowId>
): BrowserSnapshotView {
  const nextWindowsById = new Map(nextView.windows.map((window) => [window.id, window]));

  return {
    windows: currentView.windows.map((currentWindow) =>
      affectedWindowIds.has(currentWindow.id) ? nextWindowsById.get(currentWindow.id) ?? currentWindow : currentWindow
    )
  };
}

function affectedWindowIds(currentView: BrowserSnapshotView, nextView: BrowserSnapshotView) {
  const currentWindowsById = new Map(currentView.windows.map((window) => [window.id, window]));
  const affected = new Set<NativeWindowId>();

  for (const nextWindow of nextView.windows) {
    const currentWindow = currentWindowsById.get(nextWindow.id);

    if (!currentWindow || windowLayoutKey(currentWindow) !== windowLayoutKey(nextWindow)) {
      affected.add(nextWindow.id);
    }
  }

  return affected;
}

function windowLayoutKey(window: WindowView) {
  return JSON.stringify({
    groups: window.groupSpans.map((group) => ({
      endIndex: group.endIndex,
      groupId: group.groupId,
      startIndex: group.startIndex,
      tabIds: group.tabIds,
      windowId: group.windowId
    })),
    tabs: window.items.map((item) => ({
      groupId: item.tab.groupId,
      id: item.tab.id,
      index: item.tab.index,
      windowId: item.tab.windowId
    })),
    windowId: window.id
  });
}

function movedTabIds(currentView: BrowserSnapshotView, nextView: BrowserSnapshotView) {
  const currentPlacements = tabPlacements(currentView);
  const nextPlacements = tabPlacements(nextView);
  const moved: NativeTabId[] = [];

  for (const tabId of tabIds(currentView)) {
    const current = currentPlacements.get(tabId);
    const next = nextPlacements.get(tabId);

    if (!current || !next) {
      continue;
    }

    if (current.groupId !== next.groupId || current.index !== next.index || current.windowId !== next.windowId) {
      moved.push(tabId);
    }
  }

  return moved;
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

function sameTabContent(left: WindowView['items'][number]['tab'], right: WindowView['items'][number]['tab']) {
  return (
    left.active === right.active &&
    left.audible === right.audible &&
    left.favIconUrl === right.favIconUrl &&
    left.pinned === right.pinned &&
    left.title === right.title &&
    left.url === right.url
  );
}

function sameGroupMetadata(
  left: BrowserSnapshotView['windows'][number]['groupSpans'][number],
  right: BrowserSnapshotView['windows'][number]['groupSpans'][number]
) {
  return left.color === right.color && left.title === right.title;
}

function symmetricDifference<T>(left: T[], right: T[]) {
  return [...difference(left, right), ...difference(right, left)];
}

function difference<T>(left: T[], right: T[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}
