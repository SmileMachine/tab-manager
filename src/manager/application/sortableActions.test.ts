import { describe, expect, it, vi } from 'vitest';

import type { BrowserSnapshotView, WindowView } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { reconcileSortableProjection } from './sortableActions';

describe('reconcileSortableProjection', () => {
  it('moves unchanged whole groups through the native group API', async () => {
    const api = fakeApi();

    await reconcileSortableProjection(api, view([1, 2, 3], [2, 3], 1), view([2, 3, 1], [2, 3], 0), [
      { windowId: 1, items: [], wholeGroupMoveIds: [7] }
    ]);

    expect(api.moveGroup).toHaveBeenCalledWith(7, 1, 0);
    expect(api.moveTab).toHaveBeenLastCalledWith(1, 1, 2);
  });

  it('does not infer whole group movement when a tab drag shifts a group start index', async () => {
    const api = fakeApi();

    await reconcileSortableProjection(api, view([1, 2, 3, 4], [2, 3], 1), view([2, 3, 1, 4], [2, 3], 0));

    expect(api.moveGroup).not.toHaveBeenCalled();
    expect(api.moveTab).toHaveBeenCalledWith(2, 1, 0);
    expect(api.moveTab).toHaveBeenCalledWith(3, 1, 1);
    expect(api.moveTab).toHaveBeenCalledWith(1, 1, 2);
  });

  it('updates tab group membership before enforcing final tab order', async () => {
    const api = fakeApi();

    await reconcileSortableProjection(api, view([1, 2, 3], [2], 1), view([1, 2, 3], [2, 3], 1));

    expect(api.moveTabToGroup).toHaveBeenCalledWith(3, 7);
    expect(api.moveTab).toHaveBeenCalledWith(3, 1, 2);
  });

  it('moves a tab to the target window before joining a cross-window group', async () => {
    const api = fakeApi();
    const sourceView: BrowserSnapshotView = {
      windows: [
        windowView({ activeTabId: 1, focused: true, groupedTabIds: [], id: 1, order: [1, 2] }),
        windowView({ activeTabId: 3, focused: false, groupedTabIds: [3], id: 2, order: [3] })
      ]
    };
    const projectedView: BrowserSnapshotView = {
      windows: [
        windowView({ activeTabId: 1, focused: true, groupedTabIds: [], id: 1, order: [1] }),
        windowView({ activeTabId: 3, focused: false, groupedTabIds: [3, 2], id: 2, order: [3, 2] })
      ]
    };

    await reconcileSortableProjection(api, sourceView, projectedView);

    expect(api.moveTabsToGroup).toHaveBeenCalledWith([2], 7, 2);
    expect(api.moveTabToGroup).not.toHaveBeenCalledWith(2, 7);
  });

  it('does not move individual tabs after moving a whole group across windows', async () => {
    const api = fakeApi();
    const sourceView: BrowserSnapshotView = {
      windows: [
        windowView({ activeTabId: 1, focused: true, groupedTabIds: [2, 3], id: 1, order: [1, 2, 3] }),
        windowView({ activeTabId: 4, focused: false, groupedTabIds: [], id: 2, order: [4] })
      ]
    };
    const projectedView: BrowserSnapshotView = {
      windows: [
        windowView({ activeTabId: 1, focused: true, groupedTabIds: [], id: 1, order: [1] }),
        windowView({ activeTabId: 4, focused: false, groupedTabIds: [2, 3], id: 2, order: [4, 2, 3] })
      ]
    };

    await reconcileSortableProjection(api, sourceView, projectedView, [{ windowId: 2, items: [], wholeGroupMoveIds: [7] }]);

    expect(api.moveGroup).toHaveBeenCalledWith(7, 2, 1);
    expect(api.moveTab).not.toHaveBeenCalledWith(2, 2, 1);
    expect(api.moveTab).not.toHaveBeenCalledWith(3, 2, 2);
  });

  it('restores the previously focused active tab after native moves complete', async () => {
    const api = fakeApi();

    await reconcileSortableProjection(
      api,
      {
        windows: [
          windowView({ activeTabId: 1, focused: true, groupedTabIds: [2, 3], id: 1, order: [1, 2, 3] }),
          windowView({ activeTabId: 4, focused: false, groupedTabIds: [], id: 2, order: [4] })
        ]
      },
      {
        windows: [
          windowView({ activeTabId: 1, focused: true, groupedTabIds: [], id: 1, order: [1] }),
          windowView({ activeTabId: 4, focused: false, groupedTabIds: [2, 3], id: 2, order: [4, 2, 3] })
        ]
      }
    );

    expect(api.activateTab).toHaveBeenCalledWith(1, 1);
    expect(vi.mocked(api.activateTab).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(api.moveTab).mock.invocationCallOrder.at(-1) ?? 0
    );
  });
});

function fakeApi(): BrowserTabsApi {
  return {
    activateTab: vi.fn(),
    closeTabs: vi.fn(),
    createGroup: vi.fn(),
    discardTabs: vi.fn(),
    loadSnapshot: vi.fn(),
    moveGroup: vi.fn(),
    moveTab: vi.fn(),
    moveTabsToGroup: vi.fn(),
    moveTabToGroup: vi.fn(),
    ungroupTabs: vi.fn(),
    updateGroup: vi.fn()
  } satisfies BrowserTabsApi;
}

function view(order: number[], groupedTabIds: number[], groupStartIndex: number): BrowserSnapshotView {
  return { windows: [windowView({ activeTabId: 1, focused: true, groupedTabIds, id: 1, order, groupStartIndex })] };
}

function windowView({
  activeTabId,
  focused,
  groupStartIndex,
  groupedTabIds,
  id: windowId,
  order
}: {
  activeTabId: number;
  focused: boolean;
  groupStartIndex?: number;
  groupedTabIds: number[];
  id: number;
  order: number[];
}): WindowView {
  const startIndex = groupStartIndex ?? order.findIndex((tabId) => groupedTabIds.includes(tabId));
  const window: WindowView = {
    focused,
    groupSpans:
      groupedTabIds.length > 0
        ? [
            {
              color: 'blue',
              endIndex: startIndex + groupedTabIds.length - 1,
              groupId: 7,
              startIndex,
              tabCount: groupedTabIds.length,
              tabIds: groupedTabIds,
              title: 'Docs',
              windowId
            }
          ]
        : [],
    id: windowId,
    items: order.map((tabId, index) => ({
      group: groupedTabIds.includes(tabId)
        ? {
            collapsed: false,
            color: 'blue',
            id: 7,
            title: 'Docs',
            windowId
          }
        : undefined,
      kind: 'tab',
      tab: {
        active: tabId === activeTabId,
        audible: false,
        groupId: groupedTabIds.includes(tabId) ? 7 : -1,
        id: tabId,
        index,
        pinned: false,
        title: `Tab ${tabId}`,
        url: `https://example.com/${tabId}`,
        windowId
      }
    })),
    type: 'normal'
  };

  return window;
}
