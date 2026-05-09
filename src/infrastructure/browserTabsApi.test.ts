import { afterEach, describe, expect, it, vi } from 'vitest';

import { createChromeBrowserTabsApi, normalizeChromeSnapshot } from './browserTabsApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeChromeSnapshot', () => {
  it('keeps only windows and tabs with native ids', () => {
    const snapshot = normalizeChromeSnapshot({
      windows: [
        { id: 1, focused: true, type: 'normal' },
        { focused: false, type: 'normal' }
      ],
      tabs: [
        { id: 10, windowId: 1, index: 0, groupId: -1, title: 'Home', pinned: false, active: true },
        { windowId: 1, index: 1, groupId: -1, title: 'Missing id', pinned: false, active: false }
      ],
      groups: [{ id: 5, windowId: 1, title: 'Docs', color: 'blue', collapsed: false }]
    });

    expect(snapshot.windows).toEqual([{ id: 1, focused: true, type: 'normal' }]);
    expect(snapshot.tabs).toEqual([
      {
        id: 10,
        windowId: 1,
        index: 0,
        groupId: -1,
        title: 'Home',
        url: undefined,
        pinned: false,
        active: true,
        audible: false,
        favIconUrl: undefined
      }
    ]);
    expect(snapshot.groups).toEqual([
      { id: 5, windowId: 1, title: 'Docs', color: 'blue', collapsed: false }
    ]);
  });
});

describe('createChromeBrowserTabsApi', () => {
  it('creates a new group in the source tab window', async () => {
    const group = vi.fn((options: chrome.tabs.GroupOptions, done: (groupId: number) => void) => {
      done(42);
    });
    const update = vi.fn(
      (
        groupId: number,
        changes: chrome.tabGroups.UpdateProperties,
        done: (group?: chrome.tabGroups.TabGroup) => void
      ) => {
        done({ id: groupId, windowId: 7, collapsed: false, color: changes.color ?? 'blue', title: changes.title ?? '' });
      }
    );

    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      tabs: { group },
      tabGroups: { update }
    } as unknown as typeof chrome);

    const api = createChromeBrowserTabsApi();
    await api.createGroup([10, 11], 7, 'Docs', 'blue');

    expect(group).toHaveBeenCalledWith({ tabIds: [10, 11], createProperties: { windowId: 7 } }, expect.any(Function));
  });
});
