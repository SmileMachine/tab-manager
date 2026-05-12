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
  createGroup(tabIds: number[], windowId: number, title: string, color: BrowserTabGroupColor): Promise<number>;
  discardTabs(tabIds: number[]): Promise<void>;
  loadSnapshot(): Promise<BrowserSnapshot>;
  moveTab(tabId: number, targetWindowId: number, targetIndex: number): Promise<void>;
  moveTabsToGroup(tabIds: number[], targetGroupId: number, targetWindowId: number): Promise<void>;
  moveTabToGroup(tabId: number, targetGroupId: number): Promise<void>;
  ungroupTabs(tabIds: number[]): Promise<void>;
  updateGroup(groupId: number, changes: { title?: string; color?: BrowserTabGroupColor }): Promise<void>;
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
      const windows = await callChrome<chrome.windows.Window[]>((done) => {
        chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }, done);
      });
      const groups = await callChrome<chrome.tabGroups.TabGroup[]>((done) => {
        chrome.tabGroups.query({}, done);
      });
      const tabs = windows.flatMap((window) => window.tabs ?? []);

      return normalizeChromeSnapshot({ windows, tabs, groups });
    },
    async moveTab(tabId, targetWindowId, targetIndex) {
      await callChrome<chrome.tabs.Tab>((done) => chrome.tabs.move(tabId, { windowId: targetWindowId, index: targetIndex }, done));
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
    async updateGroup(groupId, changes) {
      await callChrome<chrome.tabGroups.TabGroup | undefined>((done) => chrome.tabGroups.update(groupId, changes, done));
    }
  };
}

export function normalizeChromeSnapshot(raw: RawChromeSnapshot): BrowserSnapshot {
  return {
    windows: raw.windows.flatMap(toWindowRecord),
    tabs: raw.tabs.flatMap(toTabRecord),
    groups: raw.groups.flatMap(toGroupRecord)
  };
}

function toWindowRecord(window: Partial<chrome.windows.Window>): BrowserWindowRecord[] {
  if (window.id === undefined) {
    return [];
  }

  return [
    {
      id: window.id,
      focused: window.focused ?? false,
      type: toWindowType(window.type)
    }
  ];
}

function toTabRecord(tab: Partial<chrome.tabs.Tab>): BrowserTabRecord[] {
  if (tab.id === undefined || tab.windowId === undefined || tab.index === undefined) {
    return [];
  }

  return [
    {
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
    }
  ];
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

function toWindowType(type: chrome.windows.windowTypeEnum | undefined): BrowserWindowType {
  return type ?? 'normal';
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
