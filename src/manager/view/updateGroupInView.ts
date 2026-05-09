import type { BrowserSnapshotView, BrowserTabGroupColor, NativeGroupId } from '../../domain/types';

export function updateGroupInView(
  view: BrowserSnapshotView,
  groupId: NativeGroupId,
  changes: { title?: string; color?: BrowserTabGroupColor }
): BrowserSnapshotView {
  return {
    windows: view.windows.map((window) => ({
      ...window,
      items: window.items.map((item) =>
        item.group?.id === groupId ? { ...item, group: { ...item.group, ...changes } } : item
      ),
      groupSpans: window.groupSpans.map((span) => (span.groupId === groupId ? { ...span, ...changes } : span))
    }))
  };
}
