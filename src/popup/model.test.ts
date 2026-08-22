import type { BrowserSnapshot } from '../domain/types';
import { createPopupModel } from './model';

function createSnapshot(): BrowserSnapshot {
  return {
    windows: [
      { id: 1, focused: true, type: 'normal' },
      { id: 2, focused: false, type: 'normal' }
    ],
    groups: [
      { id: 11, windowId: 1, title: 'Work', color: 'blue', collapsed: false },
      { id: 12, windowId: 1, title: 'Reading', color: 'green', collapsed: false }
    ],
    tabs: [
      {
        id: 101,
        windowId: 1,
        index: 0,
        groupId: 11,
        title: 'GitHub',
        url: 'https://github.com/example/project',
        hostname: 'github.com',
        pinned: false,
        active: true,
        audible: false,
        lastAccessed: 30
      },
      {
        id: 102,
        windowId: 1,
        index: 1,
        groupId: 11,
        title: 'Issue tracker',
        url: 'https://linear.app/example',
        hostname: 'linear.app',
        pinned: false,
        active: false,
        audible: false,
        lastAccessed: 10
      },
      {
        id: 103,
        windowId: 1,
        index: 2,
        groupId: -1,
        title: 'Supabase Dashboard',
        url: 'https://app.supabase.com/project',
        hostname: 'app.supabase.com',
        pinned: false,
        active: false,
        audible: false,
        lastAccessed: 20
      },
      {
        id: 201,
        windowId: 2,
        index: 0,
        groupId: -1,
        title: 'Remote GitHub',
        url: 'https://github.com/other/project',
        hostname: 'github.com',
        pinned: false,
        active: false,
        audible: false,
        lastAccessed: 40
      }
    ]
  };
}

describe('createPopupModel', () => {
  it('summarizes the focused window and chooses its active group tab', () => {
    const model = createPopupModel(createSnapshot());

    expect(model.focusedWindowId).toBe(1);
    expect(model.focusedWindowTabCount).toBe(3);
    expect(model.focusedWindowGroupCount).toBe(1);
    expect(model.focusedWindowUngroupedCount).toBe(1);
    expect(model.allWindowTabCount).toBe(4);
    expect(model.allWindowGroupCount).toBe(2);
    expect(model.allWindowUngroupedCount).toBe(2);
    expect(model.groups).toEqual([expect.objectContaining({ id: 11, tabCount: 2, representativeTabId: 101 })]);
  });

  it('searches title, URL, and hostname across all windows', () => {
    expect(createPopupModel(createSnapshot(), 'supabase').searchResults.map((tab) => tab.id)).toEqual([103]);
    expect(createPopupModel(createSnapshot(), 'github.com').searchResults.map((tab) => tab.id)).toEqual([101, 201]);
  });

  it('orders recent tabs by last accessed time and applies a limit', () => {
    expect(createPopupModel(createSnapshot(), '', 2).recentTabs.map((tab) => tab.id)).toEqual([201, 101]);
  });
});

describe('createPopupModel move group picker', () => {
  it('exposes the active tab and groups from the focused and other windows', () => {
    const snapshot = createSnapshot();
    snapshot.windows.push({ id: 3, focused: false, type: 'normal' });
    snapshot.groups.push({ id: 13, windowId: 3, title: 'Other', color: 'purple', collapsed: false });
    snapshot.tabs.push({
      id: 301,
      windowId: 3,
      index: 0,
      groupId: 13,
      title: 'Other tab',
      url: 'https://example.com/other',
      hostname: 'example.com',
      pinned: false,
      active: true,
      audible: false
    });

    const model = createPopupModel(snapshot);

    expect(model.activeTab?.id).toBe(101);
    expect(model.moveGroupWindows).toEqual([
      expect.objectContaining({
        windowId: 1,
        label: 'Current window',
        focused: true,
        groups: expect.arrayContaining([expect.objectContaining({ id: 11 })])
      }),
      expect.objectContaining({
        windowId: 3,
        focused: false,
        groups: [expect.objectContaining({ id: 13, tabCount: 1 })]
      })
    ]);
  });

  it('returns no active tab when the focused window has no active tab', () => {
    const snapshot = createSnapshot();
    snapshot.tabs = snapshot.tabs.map((tab) => ({ ...tab, active: false }));

    expect(createPopupModel(snapshot).activeTab).toBeUndefined();
  });
});
