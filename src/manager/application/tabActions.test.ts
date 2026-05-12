import { describe, expect, it, vi } from 'vitest';

import type { BrowserSnapshotView } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { activateTab, closeTabs, discardTabs } from './tabActions';

describe('tabActions', () => {
  it('closes tabs and refreshes after success', async () => {
    const api = fakeApi();
    const refresh = vi.fn();
    const notify = vi.fn();

    await closeTabs({ api, tabIds: [1, 2], refresh, notify });

    expect(api.closeTabs).toHaveBeenCalledWith([1, 2]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('activates a tab without refreshing the snapshot', async () => {
    const api = fakeApi();
    const refresh = vi.fn();
    const notify = vi.fn();

    await activateTab({ api, tabId: 1, windowId: 7, refresh, notify });

    expect(api.activateTab).toHaveBeenCalledWith(1, 7);
    expect(refresh).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('discards only inactive selected tabs and refreshes after success', async () => {
    const api = fakeApi();
    const refresh = vi.fn();
    const notify = vi.fn();

    await discardTabs({ api, view: view(), selectedTabIds: new Set([1, 2, 3]), refresh, notify });

    expect(api.discardTabs).toHaveBeenCalledWith([2, 3]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports unavailable or disabled actions without calling browser APIs', async () => {
    const api = fakeApi();
    const notify = vi.fn();

    await closeTabs({ api: undefined, tabIds: [1], refresh: vi.fn(), notify });
    await discardTabs({ api, view: view(), selectedTabIds: new Set([1]), refresh: vi.fn(), notify });

    expect(api.closeTabs).not.toHaveBeenCalled();
    expect(api.discardTabs).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Browser API unavailable.');
    expect(notify).toHaveBeenCalledWith('No inactive tabs can be released.');
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
        groupSpans: [],
        items: [
          { kind: 'tab', tab: tab(1, true) },
          { kind: 'tab', tab: tab(2, false) },
          { kind: 'tab', tab: tab(3, false) }
        ]
      }
    ]
  };
}

function tab(id: number, active: boolean) {
  return {
    active,
    audible: false,
    groupId: -1,
    id,
    index: id - 1,
    pinned: false,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    windowId: 1
  };
}
