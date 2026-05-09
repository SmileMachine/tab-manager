import { describe, expect, it } from 'vitest';

import { createBulkCloseSummary, planCreateGroup, planMoveToGroup } from './commands';
import type { BrowserSnapshotView } from './types';

describe('commands', () => {
  it('allows create group only for same-window selected tabs', () => {
    expect(planCreateGroup(view(), new Set([1, 2]))).toEqual({ enabled: true, windowId: 1, tabIds: [1, 2] });
    expect(planCreateGroup(view(), new Set([1, 3]))).toEqual({
      enabled: false,
      reason: 'selected-tabs-span-windows'
    });
  });

  it('plans cross-window move by window display order and native tab index', () => {
    expect(planMoveToGroup(view(), new Set([4, 2, 3]), 10)).toEqual({
      enabled: true,
      targetGroupId: 10,
      targetWindowId: 2,
      tabIds: [2, 3, 4]
    });
  });

  it('summarizes bulk close risk', () => {
    expect(createBulkCloseSummary(view(), new Set([1, 2, 4]))).toEqual({
      tabCount: 3,
      windowCount: 2,
      containsPinnedTabs: true,
      exampleTitles: ['Inbox', 'Docs', 'Pinned']
    });
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
          { kind: 'tab', tab: tab(1, 1, 0, -1, 'Inbox', false) },
          { kind: 'tab', tab: tab(2, 1, 1, 8, 'Docs', false) }
        ],
        groupSpans: [{ groupId: 8, windowId: 1, title: 'Source', color: 'blue', startIndex: 1, endIndex: 1, tabIds: [2], tabCount: 1 }]
      },
      {
        id: 2,
        focused: false,
        type: 'normal',
        items: [
          { kind: 'tab', tab: tab(3, 2, 0, 10, 'Target tab', false) },
          { kind: 'tab', tab: tab(4, 2, 1, -1, 'Pinned', true) }
        ],
        groupSpans: [
          { groupId: 10, windowId: 2, title: 'Target', color: 'green', startIndex: 0, endIndex: 0, tabIds: [3], tabCount: 1 }
        ]
      }
    ]
  };
}

function tab(id: number, windowId: number, index: number, groupId: number, title: string, pinned: boolean) {
  return {
    id,
    windowId,
    index,
    groupId,
    title,
    url: `https://example.com/${id}`,
    pinned,
    active: false,
    audible: false,
    favIconUrl: undefined
  };
}
