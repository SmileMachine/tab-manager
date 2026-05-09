import { describe, expect, it } from 'vitest';

import { applyTabFilters } from './filters';
import type { BrowserSnapshotView } from './types';

describe('applyTabFilters', () => {
  it('searches title url and domain while preserving native order', () => {
    const filtered = applyTabFilters(view(), { search: 'docs' });

    expect(filtered.windows).toHaveLength(1);
    expect(filtered.windows[0].items.map((item) => item.tab.id)).toEqual([2, 3]);
  });

  it('filters by grouped state, pinned state, window and group', () => {
    const filtered = applyTabFilters(view(), {
      windowScope: { kind: 'window', windowId: 1 },
      groupStatus: 'grouped',
      pinnedStatus: 'unpinned',
      groupId: 7
    });

    expect(filtered.windows.map((window) => window.id)).toEqual([1]);
    expect(filtered.windows[0].items.map((item) => item.tab.id)).toEqual([2]);
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
          { kind: 'tab', tab: tab(1, 1, 0, -1, 'Inbox', 'https://mail.example.com', false) },
          { kind: 'tab', tab: tab(2, 1, 1, 7, 'Chrome docs', 'https://developer.chrome.com/docs', false) },
          { kind: 'tab', tab: tab(3, 1, 2, 7, 'Pinned docs', 'https://docs.example.com', true) }
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
      },
      {
        id: 2,
        focused: false,
        type: 'normal',
        items: [{ kind: 'tab', tab: tab(4, 2, 0, -1, 'Other', 'https://example.com', false) }],
        groupSpans: []
      }
    ]
  };
}

function tab(
  id: number,
  windowId: number,
  index: number,
  groupId: number,
  title: string,
  url: string,
  pinned: boolean
) {
  return {
    id,
    windowId,
    index,
    groupId,
    title,
    url,
    pinned,
    active: false,
    audible: false,
    favIconUrl: undefined
  };
}

