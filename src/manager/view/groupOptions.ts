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
  windowIndex: number;
}

export interface WindowOption {
  id: NativeWindowId;
  tabCount: number;
  windowIndex: number;
}

export function groupsFromView(view: BrowserSnapshotView) {
  const groups = new Map<NativeGroupId, GroupOption>();

  for (const [windowIndex, window] of view.windows.entries()) {
    for (const span of window.groupSpans) {
      groups.set(span.groupId, { color: span.color, id: span.groupId, title: span.title, windowIndex });
    }
  }

  return [...groups.values()];
}

export function windowsFromView(view: BrowserSnapshotView): WindowOption[] {
  return view.windows.map((window, windowIndex) => ({ id: window.id, tabCount: window.items.length, windowIndex }));
}

export function selectedTabsFromView(view: BrowserSnapshotView, selectedTabIds: ReadonlySet<number>): BrowserTabRecord[] {
  return view.windows.flatMap((window) =>
    window.items.flatMap((item) => (selectedTabIds.has(item.tab.id) ? [item.tab] : []))
  );
}
