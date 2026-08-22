import type {
  BrowserSnapshot,
  BrowserTabGroupColor,
  BrowserTabRecord,
  NativeGroupId,
  NativeTabId,
  NativeWindowId
} from '../domain/types';

export const POPUP_RECENT_LIMIT = 5;

export interface PopupGroupSummary {
  id: NativeGroupId;
  windowId: NativeWindowId;
  title?: string;
  color: BrowserTabGroupColor;
  tabCount: number;
  representativeTabId?: NativeTabId;
}

export interface PopupWindowGroupSummary {
  windowId: NativeWindowId;
  label: string;
  focused: boolean;
  groups: PopupGroupSummary[];
}

export interface PopupModel {
  focusedWindowId?: NativeWindowId;
  focusedWindowTabCount: number;
  focusedWindowGroupCount: number;
  focusedWindowUngroupedCount: number;
  allWindowTabCount: number;
  allWindowGroupCount: number;
  allWindowUngroupedCount: number;
  activeTab?: BrowserTabRecord;
  groups: PopupGroupSummary[];
  moveGroupWindows: PopupWindowGroupSummary[];
  searchResults: BrowserTabRecord[];
  recentTabs: BrowserTabRecord[];
}

export function createPopupModel(
  snapshot: BrowserSnapshot,
  search = '',
  recentLimit = POPUP_RECENT_LIMIT,
  resultLimit?: number
): PopupModel {
  const focusedWindow = findFocusedWindow(snapshot);
  const focusedWindowTabs = focusedWindow
    ? snapshot.tabs.filter((tab) => tab.windowId === focusedWindow.id)
    : [];
  const groups = createGroupSummaries(snapshot, focusedWindow?.id, focusedWindowTabs);
  const moveGroupWindows = createMoveGroupWindows(snapshot, focusedWindow?.id);
  const normalizedSearch = search.trim().toLowerCase();

  return {
    focusedWindowId: focusedWindow?.id,
    focusedWindowTabCount: focusedWindowTabs.length,
    focusedWindowGroupCount: groups.length,
    focusedWindowUngroupedCount: focusedWindowTabs.filter((tab) => tab.groupId === -1).length,
    allWindowTabCount: snapshot.tabs.length,
    allWindowGroupCount: snapshot.groups.length,
    allWindowUngroupedCount: snapshot.tabs.filter((tab) => tab.groupId === -1).length,
    activeTab: focusedWindowTabs.find((tab) => tab.active),
    groups,
    moveGroupWindows,
    searchResults: normalizedSearch
      ? snapshot.tabs
          .filter((tab) => matchesTabSearch(tab, normalizedSearch))
          .slice(0, resultLimit ?? Number.POSITIVE_INFINITY)
      : [],
    recentTabs: [...snapshot.tabs]
      .sort(compareRecentTabs)
      .slice(0, recentLimit)
  };
}

export function findFocusedWindow(snapshot: BrowserSnapshot) {
  return (
    snapshot.windows.find((window) => window.focused && window.type === 'normal') ??
    snapshot.windows.find((window) => window.focused) ??
    snapshot.windows.find((window) => window.type === 'normal') ??
    snapshot.windows[0]
  );
}

export function matchesTabSearch(tab: BrowserTabRecord, normalizedSearch: string) {
  return [tab.title, tab.url, tab.hostname].some((value) => value?.toLowerCase().includes(normalizedSearch));
}

function createGroupSummaries(
  snapshot: BrowserSnapshot,
  focusedWindowId: NativeWindowId | undefined,
  focusedWindowTabs: BrowserTabRecord[]
) {
  if (focusedWindowId === undefined) {
    return [];
  }

  const tabsByGroup = new Map<NativeGroupId, BrowserTabRecord[]>();
  for (const tab of focusedWindowTabs) {
    if (tab.groupId === -1) {
      continue;
    }

    const tabs = tabsByGroup.get(tab.groupId) ?? [];
    tabs.push(tab);
    tabsByGroup.set(tab.groupId, tabs);
  }

  return snapshot.groups
    .filter((group) => group.windowId === focusedWindowId)
    .flatMap((group) => {
      const tabs = tabsByGroup.get(group.id) ?? [];
      if (tabs.length === 0) {
        return [];
      }

      const representativeTab = tabs.find((tab) => tab.active) ?? [...tabs].sort((left, right) => left.index - right.index)[0];
      return [
        {
          id: group.id,
          windowId: group.windowId,
          title: group.title,
          color: group.color,
          tabCount: tabs.length,
          representativeTabId: representativeTab?.id
        }
      ];
    })
    .sort((left, right) => left.id - right.id);
}

function createMoveGroupWindows(snapshot: BrowserSnapshot, focusedWindowId: NativeWindowId | undefined) {
  const windows = snapshot.windows
    .filter((window) => window.type === 'normal')
    .map((window, index) => {
      const groups = createGroupSummaries(
        snapshot,
        window.id,
        snapshot.tabs.filter((tab) => tab.windowId === window.id)
      );

      return {
        windowId: window.id,
        label: window.id === focusedWindowId ? 'Current window' : `Window ${index + 1}`,
        focused: window.id === focusedWindowId,
        groups
      };
    })
    .filter((window) => window.groups.length > 0);

  return windows.sort((left, right) => Number(right.focused) - Number(left.focused));
}

function compareRecentTabs(left: BrowserTabRecord, right: BrowserTabRecord) {
  const accessDifference = (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0);
  if (accessDifference !== 0) {
    return accessDifference;
  }

  if (left.active !== right.active) {
    return left.active ? -1 : 1;
  }

  return left.index - right.index;
}
