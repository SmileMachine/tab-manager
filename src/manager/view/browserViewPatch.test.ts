import { describe, expect, it } from 'vitest';

import type { BrowserSnapshotView, BrowserTabGroupColor, NativeGroupId, WindowView } from '../../domain/types';
import { classifyBrowserViewPatch } from './browserViewPatch';

describe('classifyBrowserViewPatch', () => {
  it('returns no-change for an identical browser view', () => {
    const current = view({ order: [1, 2, 3] });

    expect(classifyBrowserViewPatch({ currentView: current, nextView: current })).toEqual({ kind: 'no-change' });
  });

  it('confirms an optimistic operation when the browser layout matches the expected view', () => {
    expect(
      classifyBrowserViewPatch({
        currentView: view({ order: [2, 1, 3] }),
        expectedView: view({ order: [2, 1, 3] }),
        nextView: view({ order: [2, 1, 3] }),
        operationId: 'drag-1'
      })
    ).toEqual({ kind: 'confirm-optimistic', operationId: 'drag-1' });
  });

  it('classifies tab content changes without treating the list layout as changed', () => {
    const next = view({ order: [1, 2, 3], urls: { 2: 'https://target.example/path' } });

    expect(classifyBrowserViewPatch({ currentView: view({ order: [1, 2, 3] }), nextView: next })).toEqual({
      kind: 'content-update',
      tabIds: [2],
      view: next
    });
  });

  it('classifies newly opened tabs as insert-tabs', () => {
    const next = view({ order: [1, 2, 4, 3] });

    expect(classifyBrowserViewPatch({ currentView: view({ order: [1, 2, 3] }), nextView: next })).toEqual({
      kind: 'insert-tabs',
      tabIds: [4],
      view: next
    });
  });

  it('classifies closed tabs as remove-tabs', () => {
    const next = view({ order: [1, 3] });

    expect(classifyBrowserViewPatch({ currentView: view({ order: [1, 2, 3] }), nextView: next })).toEqual({
      kind: 'remove-tabs',
      tabIds: [2],
      view: next
    });
  });

  it('classifies order and group membership changes as move-tabs', () => {
    const next = view({ grouped: { 7: [2, 3] }, order: [1, 3, 2] });

    expect(
      classifyBrowserViewPatch({
        currentView: view({ grouped: { 7: [2] }, order: [1, 2, 3] }),
        nextView: next
      })
    ).toEqual({
      kind: 'move-tabs',
      tabIds: [2, 3],
      view: next
    });
  });

  it('classifies group metadata changes separately from tab content changes', () => {
    const next = view({ groupTitles: { 7: 'Updated' }, grouped: { 7: [2, 3] }, order: [1, 2, 3] });

    expect(
      classifyBrowserViewPatch({
        currentView: view({ groupTitles: { 7: 'Docs' }, grouped: { 7: [2, 3] }, order: [1, 2, 3] }),
        nextView: next
      })
    ).toEqual({
      groupIds: [7],
      kind: 'group-metadata-update',
      view: next
    });
  });

  it('classifies browser window insertions and removals as window-structure-update', () => {
    const next = { windows: [windowView({ id: 1, order: [1, 2] }), windowView({ id: 2, order: [3] })] };

    expect(classifyBrowserViewPatch({ currentView: view({ order: [1, 2] }), nextView: next })).toEqual({
      kind: 'window-structure-update',
      view: next,
      windowIds: [2]
    });
  });

  it('falls back to replace when a snapshot cannot be classified safely', () => {
    const next = view({ order: [1, 2, 2] });

    expect(classifyBrowserViewPatch({ currentView: view({ order: [1, 2, 3] }), nextView: next })).toEqual({
      kind: 'replace',
      reason: 'duplicate-tab-id',
      view: next
    });
  });
});

function view({
  grouped = {},
  groupTitles = {},
  order,
  urls = {}
}: {
  grouped?: Record<NativeGroupId, number[]>;
  groupTitles?: Record<NativeGroupId, string>;
  order: number[];
  urls?: Record<number, string>;
}): BrowserSnapshotView {
  return { windows: [windowView({ groupTitles, grouped, id: 1, order, urls })] };
}

function windowView({
  grouped = {},
  groupTitles = {},
  id,
  order,
  urls = {}
}: {
  grouped?: Record<NativeGroupId, number[]>;
  groupTitles?: Record<NativeGroupId, string>;
  id: number;
  order: number[];
  urls?: Record<number, string>;
}): WindowView {
  const groupByTabId = new Map(
    Object.entries(grouped).flatMap(([groupId, tabIds]) => tabIds.map((tabId) => [tabId, Number(groupId)]))
  );
  const groupSpans = Object.entries(grouped).map(([groupId, tabIds]) => {
    const startIndex = Math.min(...tabIds.map((tabId) => order.indexOf(tabId)));
    const endIndex = Math.max(...tabIds.map((tabId) => order.indexOf(tabId)));

    return {
      color: 'blue' as BrowserTabGroupColor,
      endIndex,
      groupId: Number(groupId),
      startIndex,
      tabCount: tabIds.length,
      tabIds,
      title: groupTitles[Number(groupId)] ?? 'Docs',
      windowId: id
    };
  });

  return {
    focused: id === 1,
    groupSpans,
    id,
    items: order.map((tabId, index) => {
      const groupId = groupByTabId.get(tabId) ?? -1;

      return {
        group:
          groupId === -1
            ? undefined
            : {
                collapsed: false,
                color: 'blue' as BrowserTabGroupColor,
                id: groupId,
                title: groupTitles[groupId] ?? 'Docs',
                windowId: id
              },
        kind: 'tab' as const,
        tab: {
          active: false,
          audible: false,
          favIconUrl: undefined,
          groupId,
          id: tabId,
          index,
          pinned: false,
          title: urls[tabId] ? `Updated ${tabId}` : `Tab ${tabId}`,
          url: urls[tabId] ?? `https://example.com/${tabId}`,
          windowId: id
        }
      };
    }),
    type: 'normal'
  };
}
