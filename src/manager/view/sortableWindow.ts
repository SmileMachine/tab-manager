import type {
  BrowserSnapshotView,
  BrowserTabGroupRecord,
  GroupSpan,
  NativeGroupId,
  NativeTabId,
  NativeWindowId,
  WindowView
} from '../../domain/types';

export type SortableWindowItem =
  | { kind: 'tab'; tabId: NativeTabId }
  | { kind: 'group'; groupId: NativeGroupId; tabIds: NativeTabId[] };

export interface SortableWindowState {
  windowId: NativeWindowId;
  items: SortableWindowItem[];
  wholeGroupMoveIds?: NativeGroupId[];
}

export function projectSortableWindowsInView(
  view: BrowserSnapshotView,
  states: SortableWindowState[]
): BrowserSnapshotView {
  const statesByWindow = new Map(states.map((state) => [state.windowId, state]));
  const allTabsById = new Map(view.windows.flatMap((window) => window.items.map((item) => [item.tab.id, item])));
  const groupsById = new Map(view.windows.flatMap((window) => window.groupSpans.map((group) => [group.groupId, group])));

  return {
    windows: view.windows.map((window) => {
      const state = statesByWindow.get(window.id);

      if (!state) {
        return window;
      }

      return projectWindow(window, state, allTabsById, groupsById);
    })
  };
}

function projectWindow(
  window: WindowView,
  state: SortableWindowState,
  allTabsById: Map<NativeTabId, WindowView['items'][number]>,
  groupsById: Map<NativeGroupId, GroupSpan>
): WindowView {
  const items = state.items.flatMap((item, index) => {
    if (item.kind === 'tab') {
      const tab = allTabsById.get(item.tabId);

      return tab ? [{ ...tab, tab: { ...tab.tab, groupId: -1, index, windowId: window.id }, group: undefined }] : [];
    }

    return item.tabIds.flatMap((tabId) => {
      const tab = allTabsById.get(tabId);

      return tab
        ? [
            {
              ...tab,
              group: groupRecordFromSpan(groupsById.get(item.groupId)),
              tab: { ...tab.tab, groupId: item.groupId, index: 0, windowId: window.id }
            }
          ]
        : [];
    });
  });

  const reindexedItems = items.map((item, index) => ({
    ...item,
    tab: { ...item.tab, index }
  }));

  return {
    ...window,
    items: reindexedItems,
    groupSpans: createProjectedGroupSpans(reindexedItems, groupsById, window.id)
  };
}

function groupRecordFromSpan(group: GroupSpan | undefined): BrowserTabGroupRecord | undefined {
  return group
    ? {
        collapsed: false,
        color: group.color,
        id: group.groupId,
        title: group.title,
        windowId: group.windowId
      }
    : undefined;
}

function createProjectedGroupSpans(
  items: WindowView['items'],
  groupsById: Map<NativeGroupId, GroupSpan>,
  windowId: NativeWindowId
) {
  const spans: GroupSpan[] = [];
  let cursor = 0;

  while (cursor < items.length) {
    const groupId = items[cursor].tab.groupId;

    if (groupId === -1) {
      cursor += 1;
      continue;
    }

    const startIndex = cursor;
    const tabIds: NativeTabId[] = [];

    while (cursor < items.length && items[cursor].tab.groupId === groupId) {
      tabIds.push(items[cursor].tab.id);
      cursor += 1;
    }

    const group = groupsById.get(groupId);

    if (group) {
      spans.push({
        ...group,
        endIndex: cursor - 1,
        startIndex,
        tabCount: tabIds.length,
        tabIds,
        windowId
      });
    }
  }

  return spans;
}
