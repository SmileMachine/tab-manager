import { describe, expect, it } from 'vitest';

import type { BrowserSnapshotView, WindowView } from '../../domain/types';
import { projectSortableWindowsInView, type SortableWindowState } from './sortableWindow';

describe('projectSortableWindowsInView', () => {
  it('moves a whole group block according to the sortable window state', () => {
    const next = projectSortableWindowsInView(view(), [
      state([
        { kind: 'tab', tabId: 1 },
        { kind: 'group', groupId: 8, tabIds: [3, 4] },
        { kind: 'group', groupId: 7, tabIds: [2] },
        { kind: 'tab', tabId: 5 }
      ])
    ]);

    expect(next.windows[0].items.map((item) => item.tab.id)).toEqual([1, 3, 4, 2, 5]);
    expect(next.windows[0].groupSpans.map((group) => ({ groupId: group.groupId, tabIds: group.tabIds }))).toEqual([
      { groupId: 8, tabIds: [3, 4] },
      { groupId: 7, tabIds: [2] }
    ]);
  });

  it('moves a tab into a group and updates its group id', () => {
    const next = projectSortableWindowsInView(view(), [
      state([
        { kind: 'tab', tabId: 1 },
        { kind: 'group', groupId: 7, tabIds: [2, 5] },
        { kind: 'group', groupId: 8, tabIds: [3, 4] }
      ])
    ]);

    expect(next.windows[0].items.map((item) => ({ id: item.tab.id, groupId: item.tab.groupId }))).toEqual([
      { id: 1, groupId: -1 },
      { id: 2, groupId: 7 },
      { id: 5, groupId: 7 },
      { id: 3, groupId: 8 },
      { id: 4, groupId: 8 }
    ]);
    expect(next.windows[0].items.find((item) => item.tab.id === 5)?.group?.id).toBe(7);
  });
});

function state(items: SortableWindowState['items']): SortableWindowState {
  return { windowId: 1, items };
}

function view(): BrowserSnapshotView {
  const window: WindowView = {
    id: 1,
    focused: true,
    type: 'normal',
    items: [
      { kind: 'tab', tab: tab(1, 0, -1) },
      { kind: 'tab', tab: tab(2, 1, 7), group: group(7, 'Docs') },
      { kind: 'tab', tab: tab(3, 2, 8), group: group(8, 'Work') },
      { kind: 'tab', tab: tab(4, 3, 8), group: group(8, 'Work') },
      { kind: 'tab', tab: tab(5, 4, -1) }
    ],
    groupSpans: [
      { groupId: 7, windowId: 1, title: 'Docs', color: 'blue', startIndex: 1, endIndex: 1, tabIds: [2], tabCount: 1 },
      { groupId: 8, windowId: 1, title: 'Work', color: 'green', startIndex: 2, endIndex: 3, tabIds: [3, 4], tabCount: 2 }
    ]
  };

  return { windows: [window] };
}

function tab(id: number, index: number, groupId: number) {
  return {
    active: false,
    audible: false,
    groupId,
    id,
    index,
    pinned: false,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    windowId: 1
  };
}

function group(id: number, title: string) {
  return { id, windowId: 1, title, color: id === 7 ? 'blue' : 'green', collapsed: false } as const;
}
