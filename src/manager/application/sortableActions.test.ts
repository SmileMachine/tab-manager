import { describe, expect, it, vi } from 'vitest';

import type { BrowserSnapshotView, WindowView } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { reconcileSortableProjection } from './sortableActions';
import { createSerializedBrowserTabsApi } from '../../infrastructure/serializedBrowserTabsApi';

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

  it('does not move tabs whose projected placement is unchanged', async () => {
    const api = fakeApi();

    await reconcileSortableProjection(api, view([1, 2, 3, 4], [2, 3], 1), view([1, 3, 2, 4], [2, 3], 1));

    expect(api.moveTab).toHaveBeenCalledTimes(2);
    expect(api.moveTab).toHaveBeenCalledWith(3, 1, 1);
    expect(api.moveTab).toHaveBeenCalledWith(2, 1, 2);
    expect(api.moveTab).not.toHaveBeenCalledWith(1, 1, 0);
    expect(api.moveTab).not.toHaveBeenCalledWith(4, 1, 3);
  });

  it('batches an internal group reorder through the native tabs API', async () => {
    const api = fakeApiWithBatchMove();

    await reconcileSortableProjection(api, view([1, 2, 3, 4], [1, 2, 3], 0), view([1, 3, 2, 4], [1, 3, 2], 0));

    expect(api.moveTabs).toHaveBeenCalledWith([1, 3, 2], 1, 0);
    expect(api.moveTab).not.toHaveBeenCalled();
  });

  it('updates tab group membership before enforcing final tab order', async () => {
    const api = fakeApi();

    await reconcileSortableProjection(api, view([1, 2, 3], [2], 1), view([1, 2, 3], [2, 3], 1));

    expect(api.groupTabs).toHaveBeenCalledWith([3], 7);
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

  it('groups a same-window selection in one batch and orders the target group in one move', async () => {
    const api = fakeApiWithBatchMove();

    await reconcileSortableProjection(api, view([1, 2, 3, 4], [2], 1), view([1, 2, 3, 4], [2, 3, 4], 1));

    expect(api.groupTabs).toHaveBeenCalledExactlyOnceWith([3, 4], 7);
    expect(api.moveTabs).toHaveBeenCalledExactlyOnceWith([2, 3, 4], 1, 1);
    expect(api.moveTabToGroup).not.toHaveBeenCalled();
    expect(api.moveTabsToGroup).not.toHaveBeenCalled();
    expect(api.moveTab).not.toHaveBeenCalled();
  });

  it('moves a cross-window selection into a group in one batch in projected order', async () => {
    const api = fakeApiWithBatchMove();
    const sourceView = { windows: [
      windowView({ activeTabId: 1, focused: true, groupedTabIds: [], id: 1, order: [1, 2, 3] }),
      windowView({ activeTabId: 4, focused: false, groupedTabIds: [4], id: 2, order: [4] })
    ] };
    const projectedView = { windows: [
      windowView({ activeTabId: 1, focused: true, groupedTabIds: [], id: 1, order: [1] }),
      windowView({ activeTabId: 4, focused: false, groupedTabIds: [4, 3, 2], id: 2, order: [4, 3, 2] })
    ] };

    await reconcileSortableProjection(api, sourceView, projectedView);

    expect(api.moveTabsToGroup).toHaveBeenCalledExactlyOnceWith([3, 2], 7, 2);
    expect(api.moveTabs).toHaveBeenCalledExactlyOnceWith([4, 3, 2], 2, 0);
    expect(api.moveTab).not.toHaveBeenCalled();
  });

  it('keeps distinct target groups in separate batches', async () => {
    const api = fakeApiWithBatchMove();
    const source = { windows: [
      windowView({ activeTabId: 1, focused: true, groupedTabIds: [1], id: 1, order: [1, 2] }),
      windowView({ activeTabId: 3, focused: false, groupedTabIds: [3], id: 2, order: [3, 4] })
    ] };
    const projected = { windows: [
      windowView({ activeTabId: 1, focused: true, groupedTabIds: [1, 2], id: 1, order: [1, 2] }),
      windowView({ activeTabId: 3, focused: false, groupedTabIds: [3, 4], id: 2, order: [3, 4] })
    ] };
    // Native group ids are globally distinct, even when they belong to different windows.
    for (const window of [source.windows[1], projected.windows[1]]) {
      window.groupSpans[0].groupId = 8;
      for (const item of window.items) {
        if (item.tab.groupId === 7) { item.tab.groupId = 8; item.group!.id = 8; }
      }
    }

    await reconcileSortableProjection(api, source, projected);

    expect(api.groupTabs).toHaveBeenCalledTimes(2);
    expect(api.groupTabs).toHaveBeenNthCalledWith(1, [2], 7);
    expect(api.groupTabs).toHaveBeenNthCalledWith(2, [4], 8);
  });

  it('batches mixed same-window and cross-window members for the same destination', async () => {
    const api = fakeApiWithBatchMove();
    const source = { windows: [
      windowView({ activeTabId: 1, focused: true, groupedTabIds: [], id: 1, order: [1, 2] }),
      windowView({ activeTabId: 3, focused: false, groupedTabIds: [3], id: 2, order: [3, 4] })
    ] };
    const projected = { windows: [
      windowView({ activeTabId: 1, focused: true, groupedTabIds: [], id: 1, order: [1] }),
      windowView({ activeTabId: 3, focused: false, groupedTabIds: [3, 4, 2], id: 2, order: [3, 4, 2] })
    ] };

    await reconcileSortableProjection(api, source, projected);

    expect(api.moveTabsToGroup).toHaveBeenCalledExactlyOnceWith([4, 2], 7, 2);
    expect(api.groupTabs).not.toHaveBeenCalled();
    expect(api.moveTabs).toHaveBeenCalledExactlyOnceWith([3, 4, 2], 2, 0);
  });

  it('ungroups a selected batch without submitting per-tab grouping requests', async () => {
    const api = fakeApiWithBatchMove();
    await reconcileSortableProjection(api, view([1, 2, 3, 4], [2, 3], 1), view([1, 2, 3, 4], [], 0));
    expect(api.ungroupTabs).toHaveBeenCalledExactlyOnceWith([2, 3]);
    expect(api.groupTabs).not.toHaveBeenCalled();
    expect(api.moveTabsToGroup).not.toHaveBeenCalled();
  });

  it('completes drag grouping, ordering, and focus before a later bulk request changes the same tabs', async () => {
    const raw = fakeApiWithBatchMove();
    const started = deferred();
    const release = deferred();
    const calls: string[] = [];
    const membership = new Map([[2, 7], [3, -1], [4, -1]]);
    vi.mocked(raw.groupTabs!).mockImplementation(async (tabIds, groupId) => {
      calls.push('drag-group');
      tabIds.forEach((id) => membership.set(id, groupId));
      started.resolve();
      await release.promise;
    });
    raw.moveTabs.mockImplementation(async () => { calls.push('drag-order'); });
    vi.mocked(raw.activateTab).mockImplementation(async () => { calls.push('drag-focus'); });
    vi.mocked(raw.moveTabsToGroup).mockImplementation(async (tabIds, groupId) => {
      calls.push('bulk-group');
      tabIds.forEach((id) => membership.set(id, groupId));
    });
    const api = createSerializedBrowserTabsApi(raw);

    const drag = reconcileSortableProjection(api, view([1, 2, 3, 4], [2], 1), view([1, 2, 3, 4], [2, 3, 4], 1));
    await started.promise;
    const bulk = api.moveTabsToGroup([3, 4], 8, 1);
    await Promise.resolve();
    expect(raw.moveTabsToGroup).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([drag, bulk]);

    expect(calls).toEqual(['drag-group', 'drag-order', 'drag-focus', 'bulk-group']);
    expect([...membership]).toEqual([[2, 7], [3, 8], [4, 8]]);
  });

  it('serializes two drag commits even when the first is paused during grouping', async () => {
    const raw = fakeApiWithBatchMove();
    const started = deferred();
    const release = deferred();
    vi.mocked(raw.groupTabs!).mockImplementationOnce(async () => { started.resolve(); await release.promise; });
    const api = createSerializedBrowserTabsApi(raw);
    const initial = view([1, 2, 3, 4], [2], 1);
    const firstProjection = view([1, 2, 3, 4], [2, 3], 1);
    const first = reconcileSortableProjection(api, initial, firstProjection);
    await started.promise;
    const second = reconcileSortableProjection(api, firstProjection, view([1, 2, 3, 4], [2, 3, 4], 1));
    await Promise.resolve();
    expect(raw.groupTabs).toHaveBeenCalledTimes(1);
    release.resolve();
    await Promise.all([first, second]);
    expect(raw.groupTabs).toHaveBeenNthCalledWith(1, [3], 7);
    expect(raw.groupTabs).toHaveBeenNthCalledWith(2, [4], 7);
    expect(raw.moveTabs).toHaveBeenNthCalledWith(1, [2, 3], 1, 1);
    expect(raw.moveTabs).toHaveBeenNthCalledWith(2, [2, 3, 4], 1, 1);
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
    groupTabs: vi.fn(),
    moveGroup: vi.fn(),
    moveTab: vi.fn(),
    moveTabsToGroup: vi.fn(),
    moveTabToGroup: vi.fn(),
    ungroupTabs: vi.fn(),
    updateGroup: vi.fn()
  } satisfies BrowserTabsApi;
}

function fakeApiWithBatchMove(): BrowserTabsApi & { moveTabs: ReturnType<typeof vi.fn> } {
  return { ...fakeApi(), moveTabs: vi.fn() };
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
