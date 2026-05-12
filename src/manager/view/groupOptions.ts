import type {
  BrowserSnapshotView,
  BrowserTabRecord,
  BrowserTabGroupColor,
  NativeGroupId,
  NativeWindowId
} from '../../domain/types';

export interface GroupOption {
  color: BrowserTabGroupColor;
  id: NativeGroupId;
  title?: string;
  windowName: string;
  windowIndex: number;
}

export interface WindowOption {
  id: NativeWindowId;
  name: string;
  tabCount: number;
  windowIndex: number;
}

export function displayNameForWindow(
  windowId: NativeWindowId,
  windowIndex: number,
  windowNames: Readonly<Record<NativeWindowId, string>>
) {
  return windowNames[windowId] || `Window ${windowIndex + 1}`;
}

export function groupsFromView(view: BrowserSnapshotView, windowNames: Readonly<Record<NativeWindowId, string>> = {}) {
  const groups = new Map<NativeGroupId, GroupOption>();

  for (const [windowIndex, window] of view.windows.entries()) {
    for (const span of window.groupSpans) {
      groups.set(span.groupId, {
        color: span.color,
        id: span.groupId,
        title: span.title,
        windowIndex,
        windowName: displayNameForWindow(window.id, windowIndex, windowNames)
      });
    }
  }

  return [...groups.values()];
}

export function windowsFromView(
  view: BrowserSnapshotView,
  windowNames: Readonly<Record<NativeWindowId, string>> = {}
): WindowOption[] {
  return view.windows.map((window, windowIndex) => ({
    id: window.id,
    name: displayNameForWindow(window.id, windowIndex, windowNames),
    tabCount: window.items.length,
    windowIndex
  }));
}

export function selectedTabsFromView(view: BrowserSnapshotView, selectedTabIds: ReadonlySet<number>): BrowserTabRecord[] {
  return view.windows.flatMap((window) =>
    window.items.flatMap((item) => (selectedTabIds.has(item.tab.id) ? [item.tab] : []))
  );
}
