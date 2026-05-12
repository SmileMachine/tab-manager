import { describe, expect, it } from 'vitest';

import { createWindowRows } from './windowRows';
import type { WindowView } from './types';

describe('createWindowRows', () => {
  it('keeps expanded groups as tab rows', () => {
    const rows = createWindowRows(windowView(), new Set());

    expect(rows.map((row) => row.kind)).toEqual(['tab', 'tab', 'tab']);
  });

  it('replaces a collapsed group with one summary row', () => {
    const rows = createWindowRows(windowView(), new Set([7]));

    expect(rows).toMatchObject([
      { kind: 'tab', tab: { id: 1 } },
      { kind: 'group-summary', groupId: 7, tabIds: [2, 3], tabCount: 2 }
    ]);
  });
});

function windowView(): WindowView {
  return {
    id: 1,
    focused: true,
    type: 'normal',
    items: [
      { kind: 'tab', tab: tab(1, -1, 'Inbox') },
      {
        kind: 'tab',
        tab: tab(2, 7, 'Chrome docs', 'https://developer.chrome.com/docs'),
        group: { id: 7, windowId: 1, title: 'Research', color: 'blue', collapsed: false }
      },
      {
        kind: 'tab',
        tab: tab(3, 7, 'Edge docs', 'https://learn.microsoft.com/edge'),
        group: { id: 7, windowId: 1, title: 'Research', color: 'blue', collapsed: false }
      }
    ],
    groupSpans: [
      {
        groupId: 7,
        windowId: 1,
        title: 'Research',
        color: 'blue',
        startIndex: 1,
        endIndex: 2,
        tabIds: [2, 3],
        tabCount: 2
      }
    ]
  };
}

function tab(id: number, groupId: number, title: string, url = 'https://example.com') {
  return {
    id,
    windowId: 1,
    index: id - 1,
    groupId,
    title,
    url,
    pinned: false,
    active: false,
    audible: false,
    favIconUrl: undefined
  };
}
