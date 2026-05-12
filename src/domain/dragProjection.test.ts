import { describe, expect, it } from 'vitest';

import { projectTabDropInView, projectWindowRowTabOrder, projectWindowRowTabPositions } from './dragProjection';
import type { BrowserSnapshotView } from './types';
import type { WindowRow } from './windowRows';

describe('projectWindowRowTabOrder', () => {
  it('projects the dragged tab after the target tab', () => {
    expect(projectWindowRowTabOrder([row(1, -1), row(2, 7), row(3, 7)], 1, { kind: 'tab', tabId: 3, position: 'after' })).toEqual([
      2, 3, 1
    ]);
  });

  it('projects the dragged tab to the end of a group', () => {
    expect(projectWindowRowTabOrder([row(1, -1), row(2, 7), row(3, 7), row(4, -1)], 1, { kind: 'group', groupId: 7 })).toEqual([
      2, 3, 1, 4
    ]);
  });

  it('keeps order unchanged when the target is outside the window rows', () => {
    expect(projectWindowRowTabOrder([row(1, -1), row(2, 7)], 1, { kind: 'tab', tabId: 3, position: 'before' })).toEqual([
      1, 2
    ]);
  });
});

describe('projectWindowRowTabPositions', () => {
  it('maps projected tab order back to row slots', () => {
    expect(projectWindowRowTabPositions([row(1, -1), row(2, 7), row(3, 7)], 1, { kind: 'tab', tabId: 3, position: 'after' })).toEqual({
      1: 3,
      2: 1,
      3: 2
    });
  });
});

describe('projectTabDropInView', () => {
  it('reorders the tab and applies the target group', () => {
    const next = projectTabDropInView(view(), 1, { kind: 'tab', tabId: 3, position: 'after' });

    expect(next.windows[0].items.map((item) => item.tab.id)).toEqual([2, 3, 1, 4]);
    expect(next.windows[0].items.map((item) => item.tab.groupId)).toEqual([7, 7, 7, -1]);
    expect(next.windows[0].groupSpans).toMatchObject([{ groupId: 7, startIndex: 0, endIndex: 2, tabIds: [2, 3, 1] }]);
  });

  it('moves the group span start when an upper ungrouped tab enters a lower group', () => {
    const next = projectTabDropInView(view(), 1, { kind: 'tab', tabId: 2, position: 'before' });

    expect(next.windows[0].items.map((item) => item.tab.id)).toEqual([1, 2, 3, 4]);
    expect(next.windows[0].items.map((item) => item.tab.groupId)).toEqual([7, 7, 7, -1]);
    expect(next.windows[0].groupSpans).toMatchObject([{ groupId: 7, startIndex: 0, endIndex: 2, tabIds: [1, 2, 3] }]);
  });

  it('moves the tab out of a group when dropped on an ungrouped row', () => {
    const next = projectTabDropInView(view(), 2, { kind: 'tab', tabId: 4, position: 'after' });

    expect(next.windows[0].items.map((item) => item.tab.id)).toEqual([1, 3, 4, 2]);
    expect(next.windows[0].items.map((item) => item.tab.groupId)).toEqual([-1, 7, -1, -1]);
  });
});

function view(): BrowserSnapshotView {
  return {
    windows: [
      {
        id: 1,
        focused: true,
        type: 'normal',
        items: [
          { kind: 'tab', tab: tab(1, -1) },
          { kind: 'tab', tab: tab(2, 7) },
          { kind: 'tab', tab: tab(3, 7) },
          { kind: 'tab', tab: tab(4, -1) }
        ],
        groupSpans: [
          { groupId: 7, windowId: 1, title: 'Docs', color: 'blue', startIndex: 1, endIndex: 2, tabIds: [2, 3], tabCount: 2 }
        ]
      }
    ]
  };
}

function row(id: number, groupId: number): WindowRow {
  return {
    kind: 'tab',
    tab: tab(id, groupId),
    groupId,
    listIndex: id - 1,
    isGroupStart: false,
    isGroupEnd: false
  };
}

function tab(id: number, groupId: number) {
  return {
    id,
    windowId: 1,
    index: id - 1,
    groupId,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    pinned: false,
    active: false,
    audible: false,
    favIconUrl: undefined
  };
}
