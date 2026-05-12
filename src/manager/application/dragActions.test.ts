import { describe, expect, it, vi } from 'vitest';

import type { BrowserSnapshotView } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { moveGroup } from './dragActions';

describe('dragActions', () => {
  it('moves a group according to the planned target and refreshes', async () => {
    const api = fakeApi();
    const refresh = vi.fn();
    const notify = vi.fn();

    await moveGroup({ api, view: view(), groupId: 8, target: { kind: 'tab', tabId: 1, position: 'before' }, refresh, notify });

    expect(api.moveGroup).toHaveBeenCalledWith(8, 1, 0);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects group-into-group targets without calling the browser API', async () => {
    const api = fakeApi();
    const refresh = vi.fn();
    const notify = vi.fn();

    await moveGroup({ api, view: view(), groupId: 8, target: { kind: 'group', groupId: 10 }, refresh, notify });

    expect(api.moveGroup).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports unavailable browser API', async () => {
    const notify = vi.fn();

    await moveGroup({ api: undefined, view: view(), groupId: 8, target: { kind: 'tab', tabId: 1, position: 'before' }, refresh: vi.fn(), notify });

    expect(notify).toHaveBeenCalledWith('Browser API unavailable.');
  });
});

function fakeApi(): BrowserTabsApi {
  return {
    activateTab: vi.fn().mockResolvedValue(undefined),
    closeTabs: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn().mockResolvedValue(1),
    discardTabs: vi.fn().mockResolvedValue(undefined),
    loadSnapshot: vi.fn().mockRejectedValue(new Error('not used')),
    moveGroup: vi.fn().mockResolvedValue(undefined),
    moveTab: vi.fn().mockResolvedValue(undefined),
    moveTabsToGroup: vi.fn().mockResolvedValue(undefined),
    moveTabToGroup: vi.fn().mockResolvedValue(undefined),
    ungroupTabs: vi.fn().mockResolvedValue(undefined),
    updateGroup: vi.fn().mockResolvedValue(undefined)
  };
}

function view(): BrowserSnapshotView {
  return {
    windows: [
      {
        id: 1,
        focused: true,
        type: 'normal',
        items: [
          { kind: 'tab', tab: tab(1, 1, 0, -1, 'Inbox') },
          { kind: 'tab', tab: tab(2, 1, 1, 8, 'Docs A') },
          { kind: 'tab', tab: tab(3, 1, 2, 8, 'Docs B') }
        ],
        groupSpans: [{ groupId: 8, windowId: 1, title: 'Source', color: 'blue', startIndex: 1, endIndex: 2, tabIds: [2, 3], tabCount: 2 }]
      },
      {
        id: 2,
        focused: false,
        type: 'normal',
        items: [
          { kind: 'tab', tab: tab(10, 2, 0, 10, 'Target A') },
          { kind: 'tab', tab: tab(11, 2, 1, 10, 'Target B') }
        ],
        groupSpans: [
          { groupId: 10, windowId: 2, title: 'Target', color: 'green', startIndex: 0, endIndex: 1, tabIds: [10, 11], tabCount: 2 }
        ]
      }
    ]
  };
}

function tab(id: number, windowId: number, index: number, groupId: number, title: string) {
  return {
    active: false,
    audible: false,
    groupId,
    id,
    index,
    pinned: false,
    title,
    url: `https://example.com/${id}`,
    windowId
  };
}
