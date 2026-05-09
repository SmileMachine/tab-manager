import { createBrowserSnapshotView } from './snapshot';
import type {
  BrowserSnapshotView,
  BrowserTabGroupRecord,
  BrowserTabRecord,
  NativeGroupId,
  NativeWindowId
} from './types';

export type WindowScope = { kind: 'all' } | { kind: 'current' } | { kind: 'window'; windowId: NativeWindowId };
export type GroupStatusFilter = 'all' | 'grouped' | 'ungrouped';
export type PinnedStatusFilter = 'all' | 'pinned' | 'unpinned';

export interface TabFilters {
  search?: string;
  windowScope?: WindowScope;
  groupStatus?: GroupStatusFilter;
  pinnedStatus?: PinnedStatusFilter;
  groupId?: NativeGroupId | 'all';
}

export function applyTabFilters(view: BrowserSnapshotView, filters: TabFilters): BrowserSnapshotView {
  const normalizedSearch = normalizeSearch(filters.search);
  const filteredWindows = view.windows.flatMap((window) => {
    if (!matchesWindowScope(window.id, window.focused, filters.windowScope)) {
      return [];
    }

    const tabs = window.items
      .map((item) => item.tab)
      .filter((tab) => matchesSearch(tab, normalizedSearch))
      .filter((tab) => matchesGroupStatus(tab, filters.groupStatus))
      .filter((tab) => matchesPinnedStatus(tab, filters.pinnedStatus))
      .filter((tab) => matchesGroup(tab, filters.groupId));

    if (tabs.length === 0) {
      return [];
    }

    const groups = window.groupSpans.flatMap((span): BrowserTabGroupRecord[] => {
      const sample = window.items.find((item) => item.tab.groupId === span.groupId)?.group;
      return sample
        ? [
            {
              id: sample.id,
              windowId: sample.windowId,
              title: sample.title,
              color: sample.color,
              collapsed: sample.collapsed
            }
          ]
        : [];
    });

    return [
      createBrowserSnapshotView({
        windows: [{ id: window.id, focused: window.focused, type: window.type }],
        tabs,
        groups
      }).windows[0]
    ];
  });

  return { windows: filteredWindows };
}

function normalizeSearch(search: string | undefined) {
  return search?.trim().toLowerCase() ?? '';
}

function matchesWindowScope(windowId: NativeWindowId, focused: boolean, scope: WindowScope | undefined) {
  if (!scope || scope.kind === 'all') {
    return true;
  }

  if (scope.kind === 'current') {
    return focused;
  }

  return windowId === scope.windowId;
}

function matchesSearch(tab: BrowserTabRecord, search: string) {
  if (!search) {
    return true;
  }

  return [tab.title, tab.url, domainFromUrl(tab.url)].some((value) => value?.toLowerCase().includes(search));
}

function matchesGroupStatus(tab: BrowserTabRecord, status: GroupStatusFilter | undefined) {
  if (!status || status === 'all') {
    return true;
  }

  return status === 'grouped' ? tab.groupId !== -1 : tab.groupId === -1;
}

function matchesPinnedStatus(tab: BrowserTabRecord, status: PinnedStatusFilter | undefined) {
  if (!status || status === 'all') {
    return true;
  }

  return status === 'pinned' ? tab.pinned : !tab.pinned;
}

function matchesGroup(tab: BrowserTabRecord, groupId: NativeGroupId | 'all' | undefined) {
  if (!groupId || groupId === 'all') {
    return true;
  }

  return tab.groupId === groupId;
}

function domainFromUrl(url: string | undefined) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

