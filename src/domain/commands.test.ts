import { describe, expect, it } from 'vitest';

import {
  createBulkCloseSummary,
  nextNewGroupTitle,
  planCreateGroup,
  planDiscardTabs,
  planMoveGroup,
  planMoveToGroup,
  planTabDrop
} from './commands';
import type { BrowserSnapshotView } from './types';

describe('commands', () => {
  it('allows create group only for same-window selected tabs', () => {
    expect(planCreateGroup(view(), new Set([1, 2]))).toEqual({ enabled: true, windowId: 1, tabIds: [1, 2] });
    expect(planCreateGroup(view(), new Set([1, 3]))).toEqual({
      enabled: false,
      reason: 'selected-tabs-span-windows'
    });
  });

  it('generates the next default new group title', () => {
    expect(nextNewGroupTitle(view())).toBe('New Group 1');
    expect(
      nextNewGroupTitle({
        windows: [
          {
            ...view().windows[0],
            groupSpans: [
              { groupId: 8, windowId: 1, title: 'New Group 1', color: 'blue', startIndex: 1, endIndex: 1, tabIds: [2], tabCount: 1 },
              { groupId: 9, windowId: 1, title: 'New Group 4', color: 'green', startIndex: 1, endIndex: 1, tabIds: [2], tabCount: 1 }
            ]
          }
        ]
      })
    ).toBe('New Group 5');
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

  it('plans discarding only inactive selected tabs', () => {
    expect(planDiscardTabs(view(), new Set([1, 2, 4]))).toEqual({
      enabled: true,
      skippedActiveTabCount: 1,
      tabIds: [2, 4]
    });
    expect(planDiscardTabs(view(), new Set([1]))).toEqual({
      enabled: false,
      reason: 'no-discardable-tabs'
    });
  });

  it('plans a tab reorder before a target tab', () => {
    expect(planTabDrop(view(), 4, { kind: 'tab', tabId: 3, position: 'before' })).toEqual({
      enabled: true,
      move: { tabId: 4, windowId: 2, index: 0 },
      group: { kind: 'join', groupId: 10 }
    });
  });

  it('plans moving a grouped tab into ungrouped space', () => {
    expect(planTabDrop(view(), 2, { kind: 'tab', tabId: 1, position: 'after' })).toEqual({
      enabled: true,
      move: { tabId: 2, windowId: 1, index: 1 },
      group: { kind: 'ungroup' }
    });
  });

  it('ignores dropping a tab onto itself', () => {
    expect(planTabDrop(view(), 2, { kind: 'tab', tabId: 2, position: 'after' })).toEqual({
      enabled: false,
      reason: 'same-tab'
    });
  });

  it('plans dropping a tab onto a group summary at the group end', () => {
    expect(planTabDrop(view(), 1, { kind: 'group', groupId: 8 })).toEqual({
      enabled: true,
      move: { tabId: 1, windowId: 1, index: 1 },
      group: { kind: 'join', groupId: 8 }
    });
  });

  it('plans moving a group before a tab in the same window', () => {
    expect(planMoveGroup(groupMoveView(), 8, { kind: 'tab', tabId: 1, position: 'before' })).toEqual({
      enabled: true,
      move: { groupId: 8, windowId: 1, index: 0 }
    });
  });

  it('plans moving a group after a tab in another window', () => {
    expect(planMoveGroup(groupMoveView(), 8, { kind: 'tab', tabId: 11, position: 'after' })).toEqual({
      enabled: true,
      move: { groupId: 8, windowId: 2, index: 2 }
    });
  });

  it('rejects moving a group into another group', () => {
    expect(planMoveGroup(groupMoveView(), 8, { kind: 'group', groupId: 10 })).toEqual({
      enabled: false,
      reason: 'group-into-group'
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
          { kind: 'tab', tab: { ...tab(1, 1, 0, -1, 'Inbox', false), active: true } },
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

function groupMoveView(): BrowserSnapshotView {
  return {
    windows: [
      {
        id: 1,
        focused: true,
        type: 'normal',
        items: [
          { kind: 'tab', tab: tab(1, 1, 0, -1, 'Inbox', false) },
          { kind: 'tab', tab: tab(2, 1, 1, 8, 'Docs A', false) },
          { kind: 'tab', tab: tab(3, 1, 2, 8, 'Docs B', false) }
        ],
        groupSpans: [{ groupId: 8, windowId: 1, title: 'Source', color: 'blue', startIndex: 1, endIndex: 2, tabIds: [2, 3], tabCount: 2 }]
      },
      {
        id: 2,
        focused: false,
        type: 'normal',
        items: [
          { kind: 'tab', tab: tab(10, 2, 0, 10, 'Target A', false) },
          { kind: 'tab', tab: tab(11, 2, 1, 10, 'Target B', false) }
        ],
        groupSpans: [
          { groupId: 10, windowId: 2, title: 'Target', color: 'green', startIndex: 0, endIndex: 1, tabIds: [10, 11], tabCount: 2 }
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
