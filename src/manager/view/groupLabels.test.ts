import { describe, expect, it } from 'vitest';

import type { GroupSpan } from '../../domain/types';
import type { WindowRow } from '../../domain/windowRows';
import { createGroupLabels } from './groupLabels';

describe('createGroupLabels', () => {
  it('places expanded group labels across visible tab rows', () => {
    const group = groupSpan({ startIndex: 0, endIndex: 1, tabIds: [10, 11] });
    const rows: WindowRow[] = [
      tabRow({ tabId: 10, listIndex: 0, isGroupStart: true, isGroupEnd: false }),
      tabRow({ tabId: 11, listIndex: 1, isGroupStart: false, isGroupEnd: true })
    ];

    expect(createGroupLabels(rows, new Map([[0, group]]), new Set())).toEqual([
      {
        collapsed: false,
        group,
        rowSpan: 2,
        rowStart: 1
      }
    ]);
  });

  it('places collapsed group labels on summary rows', () => {
    const row: Extract<WindowRow, { kind: 'group-summary' }> = {
      kind: 'group-summary',
      color: 'blue',
      domains: ['example.com'],
      groupId: 1,
      tabCount: 2,
      tabIds: [10, 11],
      title: 'Work',
      windowId: 1
    };

    expect(createGroupLabels([row], new Map(), new Set([1]))).toEqual([
      {
        collapsed: true,
        group: row,
        rowSpan: 1,
        rowStart: 1
      }
    ]);
  });
});

function groupSpan({
  endIndex,
  startIndex,
  tabIds
}: {
  endIndex: number;
  startIndex: number;
  tabIds: number[];
}): GroupSpan {
  return {
    color: 'blue',
    endIndex,
    groupId: 1,
    startIndex,
    tabCount: tabIds.length,
    tabIds,
    title: 'Work',
    windowId: 1
  };
}

function tabRow({
  isGroupEnd,
  isGroupStart,
  listIndex,
  tabId
}: {
  isGroupEnd: boolean;
  isGroupStart: boolean;
  listIndex: number;
  tabId: number;
}): Extract<WindowRow, { kind: 'tab' }> {
  return {
    kind: 'tab',
    groupId: 1,
    isGroupEnd,
    isGroupStart,
    listIndex,
    tab: {
      active: false,
      audible: false,
      groupId: 1,
      id: tabId,
      index: listIndex,
      pinned: false,
      title: `Tab ${tabId}`,
      windowId: 1
    }
  };
}
