import { afterEach, describe, expect, it, vi } from 'vitest';

import { createChromeBrowserTabsApi, normalizeChromeSnapshot } from './browserTabsApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createChromeBrowserTabsApi.activateTab', () => {
  it('activates the tab before focusing its window', async () => {
    const calls: string[] = [];
    const chromeStub = {
      runtime: { lastError: undefined },
      tabs: {
        update: (_tabId: number, _changes: chrome.tabs.UpdateProperties, done: (tab: chrome.tabs.Tab) => void) => {
          calls.push('tabs.update');
          done({} as chrome.tabs.Tab);
        }
      },
      windows: {
        update: (
          _windowId: number,
          _changes: chrome.windows.UpdateInfo,
          done: (window: chrome.windows.Window) => void
        ) => {
          calls.push('windows.update');
          done({} as chrome.windows.Window);
        }
      }
    } as unknown as typeof chrome;

    vi.stubGlobal('chrome', chromeStub);

    await createChromeBrowserTabsApi().activateTab(10, 2);

    expect(calls).toEqual(['tabs.update', 'windows.update']);
  });
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

    expect(snapshot.windows).toEqual([{ id: 1, focused: true, type: 'normal', tabCount: 1, groupCount: 1 }]);
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
        favIconUrl: undefined,
        hostname: null,
        origin: null,
        protocol: null,
        pathname: null,
        isNewTab: false,
        isInternalPage: false,
        isPdf: false
      }
    ]);
    expect(snapshot.groups).toEqual([
      {
        id: 5,
        windowId: 1,
        title: 'Docs',
        color: 'blue',
        collapsed: false,
        tabIds: [],
        tabCount: 0,
        startIndex: undefined,
        endIndex: undefined,
        hostnameCounts: {},
        representativeTitles: []
      }
    ]);
  });
});

describe('normalizeChromeSnapshot current window', () => {
  it('uses the current window id as the focused window', () => {
    const snapshot = normalizeChromeSnapshot(
      {
        windows: [
          { id: 1, focused: true, type: 'normal' },
          { id: 2, focused: false, type: 'normal' }
        ],
        tabs: [],
        groups: []
      },
      2
    );

    expect(snapshot.windows.map(({ id, focused }) => ({ id, focused }))).toEqual([
      { id: 1, focused: false },
      { id: 2, focused: true }
    ]);
  });
});

describe('normalizeChromeSnapshot rich fields', () => {
  it('derives URL metadata and group summaries from browser fields', () => {
    const snapshot = normalizeChromeSnapshot({
      windows: [{ id: 4, focused: false, type: 'normal', state: 'maximized', incognito: false, alwaysOnTop: true }],
      tabs: [
        {
          id: 40,
          windowId: 4,
          index: 2,
          groupId: 9,
          title: 'Reference',
          url: 'https://docs.example.test/guide/start.pdf?part=1',
          pendingUrl: undefined,
          pinned: true,
          active: false,
          highlighted: true,
          audible: true,
          discarded: false,
          autoDiscardable: true,
          status: 'complete',
          incognito: false,
          lastAccessed: 123,
          mutedInfo: { muted: true, reason: 'user' }
        },
        {
          id: 41,
          windowId: 4,
          index: 3,
          groupId: 9,
          title: 'Appendix',
          url: 'https://docs.example.test/appendix',
          pinned: false,
          active: false,
          audible: false
        }
      ],
      groups: [{ id: 9, windowId: 4, title: 'Docs', color: 'blue', collapsed: true }]
    });

    expect(snapshot.windows[0]).toMatchObject({
      state: 'maximized',
      incognito: false,
      alwaysOnTop: true,
      tabCount: 2,
      groupCount: 1
    });
    expect(snapshot.tabs[0]).toMatchObject({
      hostname: 'docs.example.test',
      origin: 'https://docs.example.test',
      protocol: 'https',
      pathname: '/guide/start.pdf',
      isPdf: true,
      muted: true,
      mutedReason: 'user'
    });
    expect(snapshot.groups[0]).toMatchObject({
      tabIds: [40, 41],
      tabCount: 2,
      startIndex: 2,
      endIndex: 3,
      hostnameCounts: { 'docs.example.test': 2 },
      representativeTitles: ['Reference', 'Appendix']
    });
  });
});

describe('createChromeBrowserTabsApi', () => {
  it('discards selected tabs', async () => {
    const discard = vi.fn((tabId: number, done: (tab: chrome.tabs.Tab) => void) => {
      done({
        id: tabId,
        windowId: 1,
        index: 0,
        pinned: false,
        highlighted: false,
        active: false,
        incognito: false,
        selected: false,
        frozen: false,
        discarded: true,
        autoDiscardable: true,
        groupId: -1
      });
    });

    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      tabs: { discard }
    } as unknown as typeof chrome);

    const api = createChromeBrowserTabsApi();
    await api.discardTabs([10, 11]);

    expect(discard).toHaveBeenCalledWith(10, expect.any(Function));
    expect(discard).toHaveBeenCalledWith(11, expect.any(Function));
  });

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

  it('moves a native group to the target window and index', async () => {
    const move = vi.fn(
      (
        groupId: number,
        options: chrome.tabGroups.MoveProperties,
        done: (group?: chrome.tabGroups.TabGroup) => void
      ) => {
        done({ id: groupId, windowId: options.windowId ?? 1, collapsed: false, color: 'blue', title: 'Docs' });
      }
    );

    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      tabGroups: { move }
    } as unknown as typeof chrome);

    const api = createChromeBrowserTabsApi();
    await api.moveGroup(5, 7, 3);

    expect(move).toHaveBeenCalledWith(5, { windowId: 7, index: 3 }, expect.any(Function));
  });
});

describe('createChromeBrowserTabsApi.moveTabToGroup', () => {
  it('moves a tab across windows before grouping it', async () => {
    const calls: string[] = [];
    const chromeStub = {
      runtime: { lastError: undefined },
      tabs: {
        get: (_tabId: number, done: (tab: chrome.tabs.Tab) => void) => {
          calls.push('tabs.get');
          done({ windowId: 1 } as chrome.tabs.Tab);
        },
        query: (_queryInfo: chrome.tabs.QueryInfo, done: (tabs: chrome.tabs.Tab[]) => void) => {
          calls.push('tabs.query');
          done([
            { windowId: 2, index: 3, groupId: 8 },
            { windowId: 2, index: 4, groupId: 8 },
            { windowId: 2, index: 5, groupId: -1 }
          ] as chrome.tabs.Tab[]);
        },
        move: (_tabId: number, changes: chrome.tabs.MoveProperties, done: (tab: chrome.tabs.Tab) => void) => {
          calls.push(`tabs.move:${changes.index}`);
          done({} as chrome.tabs.Tab);
        },
        group: (_options: chrome.tabs.GroupOptions, done: (groupId: number) => void) => {
          calls.push('tabs.group');
          done(8);
        },
        update: (_tabId: number, _changes: chrome.tabs.UpdateProperties, done: (tab: chrome.tabs.Tab) => void) => {
          calls.push('tabs.update');
          done({} as chrome.tabs.Tab);
        },
      },
      windows: {
        update: (_windowId: number, _changes: chrome.windows.UpdateInfo, done: (window: chrome.windows.Window) => void) => {
          calls.push('windows.update');
          done({} as chrome.windows.Window);
        }
      }
    } as unknown as typeof chrome;

    vi.stubGlobal('chrome', chromeStub);

    await createChromeBrowserTabsApi().moveTabToGroup(10, 8, 2);

    expect(calls).toEqual(['tabs.get', 'tabs.query', 'tabs.move:-1', 'tabs.group', 'tabs.move:5', 'tabs.update', 'windows.update']);
  });

  it('does not move a tab that is already in the target window', async () => {
    const calls: string[] = [];
    const chromeStub = {
      runtime: { lastError: undefined },
      tabs: {
        get: (_tabId: number, done: (tab: chrome.tabs.Tab) => void) => {
          calls.push('tabs.get');
          done({ windowId: 2 } as chrome.tabs.Tab);
        },
        group: (_options: chrome.tabs.GroupOptions, done: (groupId: number) => void) => {
          calls.push('tabs.group');
          done(8);
        },
        update: (_tabId: number, _changes: chrome.tabs.UpdateProperties, done: (tab: chrome.tabs.Tab) => void) => {
          calls.push('tabs.update');
          done({} as chrome.tabs.Tab);
        }
      },
      windows: {
        update: (_windowId: number, _changes: chrome.windows.UpdateInfo, done: (window: chrome.windows.Window) => void) => {
          calls.push('windows.update');
          done({} as chrome.windows.Window);
        }
      }
    } as unknown as typeof chrome;

    vi.stubGlobal('chrome', chromeStub);

    await createChromeBrowserTabsApi().moveTabToGroup(10, 8, 2);

    expect(calls).toEqual(['tabs.get', 'tabs.group', 'tabs.update', 'windows.update']);
  });
});

describe('createChromeBrowserTabsApi.groupTabs', () => {
  it('groups all supplied tabs with one native call and no intermediate window move', async () => {
    const group = vi.fn((_options, done) => done(7));
    const move = vi.fn();
    vi.stubGlobal('chrome', { runtime: { lastError: undefined }, tabs: { group, move } });

    await createChromeBrowserTabsApi().groupTabs!([3, 4, 5], 7);

    expect(group).toHaveBeenCalledExactlyOnceWith({ tabIds: [3, 4, 5], groupId: 7 }, expect.any(Function));
    expect(move).not.toHaveBeenCalled();
  });

  it('does not submit empty grouping batches', async () => {
    const group = vi.fn();
    vi.stubGlobal('chrome', { runtime: { lastError: undefined }, tabs: { group } });
    await createChromeBrowserTabsApi().groupTabs!([], 7);
    expect(group).not.toHaveBeenCalled();
  });
});

describe('createChromeBrowserTabsApi.moveTabsToGroup', () => {
  it('waits for one cross-window batch move before grouping the complete selection', async () => {
    let finishMove!: (tabs: chrome.tabs.Tab[]) => void;
    const move = vi.fn((_ids, _properties, done) => { finishMove = done; });
    const group = vi.fn((_options, done) => done(7));
    vi.stubGlobal('chrome', { runtime: { lastError: undefined }, tabs: { move, group } });

    const request = createChromeBrowserTabsApi().moveTabsToGroup([3, 2], 7, 2);
    expect(move).toHaveBeenCalledExactlyOnceWith([3, 2], { windowId: 2, index: -1 }, expect.any(Function));
    expect(group).not.toHaveBeenCalled();
    finishMove([]);
    await request;
    expect(group).toHaveBeenCalledExactlyOnceWith({ tabIds: [3, 2], groupId: 7 }, expect.any(Function));
  });
});
