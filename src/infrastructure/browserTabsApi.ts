import { enrichTabUrlMetadata } from '../domain/tabMetadata';
import type {
  BrowserSnapshot,
  BrowserTabGroupColor,
  BrowserTabGroupRecord,
  BrowserTabRecord,
  BrowserWindowRecord,
  BrowserWindowType
} from '../domain/types';

export interface BrowserTabsApi {
  activateTab(tabId: number, windowId: number): Promise<void>;
  closeTabs(tabIds: number[]): Promise<void>;
  createTabs?(tabs: Array<{ windowId?: number; index?: number; url?: string; pinned?: boolean; active?: boolean }>): Promise<number[]>;
  createWindow?(options?: { type?: 'normal' | 'popup' | 'panel'; incognito?: boolean; state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen' }): Promise<number>;
  updateWindow?(windowId: number, changes: { state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen' }): Promise<void>;
  createGroup(tabIds: number[], windowId: number, title: string, color: BrowserTabGroupColor): Promise<number>;
  discardTabs(tabIds: number[]): Promise<void>;
  loadSnapshot(): Promise<BrowserSnapshot>;
  moveGroup(groupId: number, targetWindowId: number, targetIndex: number): Promise<void>;
  moveTab(tabId: number, targetWindowId: number, targetIndex: number): Promise<void>;
  moveTabs?(tabIds: number[], targetWindowId: number, targetIndex: number): Promise<void>;
  moveTabsToGroup(tabIds: number[], targetGroupId: number, targetWindowId: number): Promise<void>;
  moveTabToGroup(tabId: number, targetGroupId: number): Promise<void>;
  ungroupTabs(tabIds: number[]): Promise<void>;
  updateTab?(tabId: number, changes: { url?: string; pinned?: boolean; muted?: boolean; autoDiscardable?: boolean }): Promise<void>;
  updateGroup(groupId: number, changes: { title?: string; color?: BrowserTabGroupColor; collapsed?: boolean }): Promise<void>;
}

interface RawChromeSnapshot {
  windows: Array<Partial<chrome.windows.Window>>;
  tabs: Array<Partial<chrome.tabs.Tab>>;
  groups: Array<Partial<chrome.tabGroups.TabGroup>>;
}

export function createChromeBrowserTabsApi(): BrowserTabsApi {
  return {
    async activateTab(tabId, windowId) {
      await callChrome<chrome.windows.Window>((done) => chrome.windows.update(windowId, { focused: true }, done));
      await callChrome<chrome.tabs.Tab | undefined>((done) => chrome.tabs.update(tabId, { active: true }, done));
    },
    async closeTabs(tabIds) {
      if (tabIds.length === 0) {
        return;
      }

      await callChrome<void>((done) => chrome.tabs.remove(tabIds, done));
    },
    async createWindow(options = {}) {
      const created = await callChrome<chrome.windows.Window | undefined>((done) => chrome.windows.create(options, done));
      if (created?.id === undefined) throw new Error('The browser did not return a created window ID.');
      return created.id;
    },
    async updateWindow(windowId, changes) {
      await callChrome<chrome.windows.Window | undefined>((done) => chrome.windows.update(windowId, changes, done));
    },
    async createTabs(tabs) {
      const created = [];
      for (const tab of tabs) {
        const result = await callChrome<chrome.tabs.Tab | undefined>((done) => chrome.tabs.create(tab, done));
        if (result?.id !== undefined) {
          created.push(result.id);
        }
      }
      return created;
    },
    async createGroup(tabIds, windowId, title, color) {
      const groupId = await callChrome<number>((done) => chrome.tabs.group({ tabIds, createProperties: { windowId } }, done));
      await callChrome<chrome.tabGroups.TabGroup | undefined>((done) =>
        chrome.tabGroups.update(groupId, { title, color }, done)
      );
      return groupId;
    },
    async discardTabs(tabIds) {
      if (tabIds.length === 0) {
        return;
      }

      await Promise.all(tabIds.map((tabId) => callChrome<chrome.tabs.Tab>((done) => chrome.tabs.discard(tabId, done))));
    },
    async loadSnapshot() {
      const [windows, currentWindow, groups] = await Promise.all([
        callChrome<chrome.windows.Window[]>((done) => {
          chrome.windows.getAll({ populate: true }, done);
        }),
        callChrome<chrome.windows.Window | undefined>((done) => {
          chrome.windows.getCurrent(done);
        }),
        callChrome<chrome.tabGroups.TabGroup[]>((done) => {
          chrome.tabGroups.query({}, done);
        })
      ]);
      const tabs = windows.flatMap((window) => window.tabs ?? []);

      return normalizeChromeSnapshot({ windows, tabs, groups }, currentWindow?.id);
    },
    async moveGroup(groupId, targetWindowId, targetIndex) {
      await callChrome<chrome.tabGroups.TabGroup | undefined>((done) =>
        chrome.tabGroups.move(groupId, { windowId: targetWindowId, index: targetIndex }, done)
      );
    },
    async moveTab(tabId, targetWindowId, targetIndex) {
      await callChrome<chrome.tabs.Tab>((done) => chrome.tabs.move(tabId, { windowId: targetWindowId, index: targetIndex }, done));
    },
    async moveTabs(tabIds, targetWindowId, targetIndex) {
      if (tabIds.length === 0) {
        return;
      }
      await callChrome<chrome.tabs.Tab[]>((done) => chrome.tabs.move(tabIds, { windowId: targetWindowId, index: targetIndex }, done));
    },
    async moveTabsToGroup(tabIds, targetGroupId, targetWindowId) {
      if (tabIds.length === 0) {
        return;
      }

      await callChrome<chrome.tabs.Tab[]>((done) => chrome.tabs.move(tabIds, { windowId: targetWindowId, index: -1 }, done));
      await callChrome<number>((done) => chrome.tabs.group({ tabIds, groupId: targetGroupId }, done));
    },
    async moveTabToGroup(tabId, targetGroupId) {
      await callChrome<number>((done) => chrome.tabs.group({ tabIds: [tabId], groupId: targetGroupId }, done));
    },
    async ungroupTabs(tabIds) {
      if (tabIds.length === 0) {
        return;
      }

      await callChrome<void>((done) => chrome.tabs.ungroup(tabIds, done));
    },
    async updateTab(tabId, changes) {
      await callChrome<chrome.tabs.Tab | undefined>((done) => chrome.tabs.update(tabId, changes, done));
    },
    async updateGroup(groupId, changes) {
      await callChrome<chrome.tabGroups.TabGroup | undefined>((done) => chrome.tabGroups.update(groupId, changes, done));
    }
  };
}

export function normalizeChromeSnapshot(raw: RawChromeSnapshot, currentWindowId?: number): BrowserSnapshot {
  const windows = raw.windows.flatMap(toWindowRecord).map((window) =>
    currentWindowId === undefined ? window : { ...window, focused: window.id === currentWindowId }
  );
  const tabs = raw.tabs.flatMap(toTabRecord).map(enrichTabUrlMetadata);
  const groups = raw.groups.flatMap(toGroupRecord);
  const tabsByWindow = new Map<number, BrowserTabRecord[]>();
  const tabsByGroup = new Map<number, BrowserTabRecord[]>();

  for (const tab of tabs) {
    const windowTabs = tabsByWindow.get(tab.windowId) ?? [];
    windowTabs.push(tab);
    tabsByWindow.set(tab.windowId, windowTabs);

    if (tab.groupId !== -1) {
      const groupTabs = tabsByGroup.get(tab.groupId) ?? [];
      groupTabs.push(tab);
      tabsByGroup.set(tab.groupId, groupTabs);
    }
  }

  return {
    windows: windows.map((window) => ({
      ...window,
      tabCount: tabsByWindow.get(window.id)?.length ?? 0,
      groupCount: groups.filter((group) => group.windowId === window.id).length
    })),
    tabs,
    groups: groups.map((group) => enrichGroupRecord(group, tabsByGroup.get(group.id) ?? []))
  };
}

function toWindowRecord(window: Partial<chrome.windows.Window>): BrowserWindowRecord[] {
  if (window.id === undefined) {
    return [];
  }

  const record: BrowserWindowRecord = {
    id: window.id,
    focused: window.focused ?? false,
    type: toWindowType(window.type)
  };

  if (window.state !== undefined) {
    record.state = window.state;
  }
  if (window.incognito !== undefined) {
    record.incognito = window.incognito;
  }
  if (window.alwaysOnTop !== undefined) {
    record.alwaysOnTop = window.alwaysOnTop;
  }
  if (window.sessionId !== undefined) {
    record.sessionId = window.sessionId;
  }

  const bounds = {
    top: window.top,
    left: window.left,
    width: window.width,
    height: window.height
  };
  if (Object.values(bounds).some((value) => value !== undefined)) {
    record.bounds = bounds;
  }

  return [record];
}

function toTabRecord(tab: Partial<chrome.tabs.Tab>): BrowserTabRecord[] {
  if (tab.id === undefined || tab.windowId === undefined || tab.index === undefined) {
    return [];
  }

  const record: BrowserTabRecord = {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    groupId: tab.groupId ?? -1,
    title: tab.title ?? 'Untitled',
    url: tab.url,
    pinned: tab.pinned ?? false,
    active: tab.active ?? false,
    audible: tab.audible ?? false,
    favIconUrl: tab.favIconUrl
  };

  if (tab.pendingUrl !== undefined) record.pendingUrl = tab.pendingUrl;
  if (tab.highlighted !== undefined) record.highlighted = tab.highlighted;
  if (tab.incognito !== undefined) record.incognito = tab.incognito;
  if (tab.discarded !== undefined) record.discarded = tab.discarded;
  if (tab.autoDiscardable !== undefined) record.autoDiscardable = tab.autoDiscardable;
  if (tab.frozen !== undefined) record.frozen = tab.frozen;
  if (tab.status !== undefined) record.status = toTabStatus(tab.status);
  if (tab.openerTabId !== undefined) record.openerTabId = tab.openerTabId;
  if (tab.sessionId !== undefined) record.sessionId = tab.sessionId;
  if (tab.lastAccessed !== undefined) record.lastAccessed = tab.lastAccessed;
  if (tab.mutedInfo?.muted !== undefined) record.muted = tab.mutedInfo.muted;
  if (tab.mutedInfo?.reason !== undefined) record.mutedReason = tab.mutedInfo.reason;

  return [record];
}

function toGroupRecord(group: Partial<chrome.tabGroups.TabGroup>): BrowserTabGroupRecord[] {
  if (group.id === undefined || group.windowId === undefined) {
    return [];
  }

  return [
    {
      id: group.id,
      windowId: group.windowId,
      title: group.title,
      color: toGroupColor(group.color),
      collapsed: group.collapsed ?? false
    }
  ];
}

function enrichGroupRecord(group: BrowserTabGroupRecord, tabs: BrowserTabRecord[]): BrowserTabGroupRecord {
  const orderedTabs = [...tabs].sort((left, right) => left.index - right.index);
  const hostnameCounts: Record<string, number> = {};

  for (const tab of orderedTabs) {
    if (tab.hostname) {
      hostnameCounts[tab.hostname] = (hostnameCounts[tab.hostname] ?? 0) + 1;
    }
  }

  return {
    ...group,
    tabIds: orderedTabs.map((tab) => tab.id),
    tabCount: orderedTabs.length,
    startIndex: orderedTabs[0]?.index,
    endIndex: orderedTabs.at(-1)?.index,
    hostnameCounts,
    representativeTitles: orderedTabs.slice(0, 5).map((tab) => tab.title)
  };
}

function toWindowType(type: chrome.windows.windowTypeEnum | undefined): BrowserWindowType {
  return type ?? 'normal';
}

function toTabStatus(status: string): BrowserTabRecord['status'] {
  return status === 'loading' || status === 'complete' || status === 'unloaded' ? status : undefined;
}

function toGroupColor(color: chrome.tabGroups.TabGroup['color'] | undefined): BrowserTabGroupColor {
  return color ?? 'grey';
}

function callChrome<T>(invoke: (done: (result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const lastError = chrome.runtime.lastError;

      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(result);
    });
  });
}
