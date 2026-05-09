import type {
  BrowserSnapshot,
  BrowserSnapshotView,
  BrowserTabGroupRecord,
  BrowserTabRecord,
  GroupSpan,
  NativeGroupId,
  WindowView
} from './types';

export function createBrowserSnapshotView(snapshot: BrowserSnapshot): BrowserSnapshotView {
  const tabsByWindow = groupTabsByWindow(snapshot.tabs);
  const groupsById = new Map(snapshot.groups.map((group) => [group.id, group]));

  return {
    windows: snapshot.windows.map((window) => {
      const tabs = [...(tabsByWindow.get(window.id) ?? [])].sort(compareTabIndex);
      const items = tabs.map((tab) => ({
        kind: 'tab' as const,
        tab,
        group: tab.groupId === -1 ? undefined : groupsById.get(tab.groupId)
      }));

      return {
        id: window.id,
        focused: window.focused,
        type: window.type,
        items,
        groupSpans: createGroupSpans(tabs, groupsById)
      } satisfies WindowView;
    })
  };
}

function groupTabsByWindow(tabs: BrowserTabRecord[]) {
  const tabsByWindow = new Map<number, BrowserTabRecord[]>();

  for (const tab of tabs) {
    const windowTabs = tabsByWindow.get(tab.windowId) ?? [];
    windowTabs.push(tab);
    tabsByWindow.set(tab.windowId, windowTabs);
  }

  return tabsByWindow;
}

function createGroupSpans(
  tabs: BrowserTabRecord[],
  groupsById: Map<NativeGroupId, BrowserTabGroupRecord>
): GroupSpan[] {
  const spans: GroupSpan[] = [];
  let cursor = 0;

  while (cursor < tabs.length) {
    const tab = tabs[cursor];

    if (tab.groupId === -1) {
      cursor += 1;
      continue;
    }

    const startIndex = cursor;
    const tabIds = [tab.id];
    cursor += 1;

    while (cursor < tabs.length && tabs[cursor].groupId === tab.groupId) {
      tabIds.push(tabs[cursor].id);
      cursor += 1;
    }

    const group = groupsById.get(tab.groupId);

    if (group) {
      spans.push({
        groupId: group.id,
        windowId: group.windowId,
        title: group.title,
        color: group.color,
        startIndex,
        endIndex: cursor - 1,
        tabIds,
        tabCount: tabIds.length
      });
    }
  }

  return spans;
}

function compareTabIndex(left: BrowserTabRecord, right: BrowserTabRecord) {
  return left.index - right.index;
}
