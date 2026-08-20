import type { BrowserSnapshot, BrowserTabRecord } from '../domain/types';
import {
  BROWSER_SNAPSHOT_SCHEMA_VERSION,
  WORKSPACE_SCHEMA_VERSION,
  type BrowserSnapshotEnvelope,
  type PortableTab,
  type PortableWindowWithGroups,
  type PortableWorkspace,
  type SnapshotDiagnostic,
  type SnapshotFieldSet
} from './protocol';

export function createSnapshotEnvelope(
  snapshot: BrowserSnapshot,
  options: { capturedAt?: string; fieldSet?: SnapshotFieldSet; diagnostics?: SnapshotDiagnostic[] } = {}
): BrowserSnapshotEnvelope {
  const normalized = normalizeSnapshot(snapshot);
  const fieldSet = options.fieldSet ?? 'full';

  return {
    schemaVersion: BROWSER_SNAPSHOT_SCHEMA_VERSION,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    revision: createSnapshotRevision(normalized),
    fieldSet,
    snapshot: selectSnapshotFieldSet(normalized, fieldSet),
    diagnostics: options.diagnostics ?? []
  };
}

export function createSnapshotRevision(snapshot: BrowserSnapshot): string {
  const serialized = stableStringify(normalizeSnapshot(snapshot));
  return `fnv1a64:${fnv1a(serialized)}`;
}

export function normalizeSnapshot(snapshot: BrowserSnapshot): BrowserSnapshot {
  const tabs = [...snapshot.tabs]
    .sort((left, right) => left.windowId - right.windowId || left.index - right.index || left.id - right.id)
    .map((tab) => ({ ...tab }));
  const tabsByGroup = new Map<number, BrowserTabRecord[]>();
  const tabsByWindow = new Map<number, BrowserTabRecord[]>();

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

  const groups = [...snapshot.groups]
    .sort((left, right) => left.windowId - right.windowId || left.id - right.id)
    .map((group) => enrichGroup(group, tabsByGroup.get(group.id) ?? []));
  const groupCountByWindow = new Map<number, number>();

  for (const group of groups) {
    groupCountByWindow.set(group.windowId, (groupCountByWindow.get(group.windowId) ?? 0) + 1);
  }

  const windows = [...snapshot.windows]
    .sort((left, right) => left.id - right.id)
    .map((window) => ({
      ...window,
      tabCount: tabsByWindow.get(window.id)?.length ?? 0,
      groupCount: groupCountByWindow.get(window.id) ?? 0
    }));

  return { windows, tabs, groups };
}

export function selectSnapshotFieldSet(snapshot: BrowserSnapshot, fieldSet: SnapshotFieldSet): BrowserSnapshot {
  if (fieldSet === 'full') {
    return snapshot;
  }

  const windows = snapshot.windows.map((window) => ({
    id: window.id,
    focused: window.focused,
    type: window.type,
    state: window.state,
    incognito: window.incognito,
    tabCount: window.tabCount,
    groupCount: window.groupCount
  }));
  const groups = snapshot.groups.map((group) => ({
    id: group.id,
    windowId: group.windowId,
    title: group.title,
    color: group.color,
    collapsed: group.collapsed,
    tabIds: group.tabIds,
    tabCount: group.tabCount,
    startIndex: group.startIndex,
    endIndex: group.endIndex,
    hostnameCounts: group.hostnameCounts,
    representativeTitles: group.representativeTitles
  }));
  const tabs = snapshot.tabs.map((tab) => {
    const minimal: BrowserTabRecord = {
      id: tab.id,
      windowId: tab.windowId,
      index: tab.index,
      groupId: tab.groupId,
      title: tab.title,
      url: tab.url,
      pinned: tab.pinned,
      active: tab.active,
      audible: tab.audible,
      hostname: tab.hostname,
      origin: tab.origin,
      protocol: tab.protocol,
      pathname: tab.pathname,
      isNewTab: tab.isNewTab,
      isInternalPage: tab.isInternalPage,
      isPdf: tab.isPdf
    };

    if (fieldSet === 'minimal') {
      return minimal;
    }

    return {
      ...minimal,
      pendingUrl: tab.pendingUrl,
      highlighted: tab.highlighted,
      muted: tab.muted,
      mutedReason: tab.mutedReason,
      discarded: tab.discarded,
      autoDiscardable: tab.autoDiscardable,
      frozen: tab.frozen,
      status: tab.status,
      incognito: tab.incognito,
      lastAccessed: tab.lastAccessed
    };
  });

  return { windows, tabs, groups };
}

function enrichGroup(group: BrowserSnapshot['groups'][number], tabs: BrowserTabRecord[]) {
  const orderedTabs = [...tabs].sort((left, right) => left.index - right.index || left.id - right.id);
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

export function toPortableWorkspace(snapshot: BrowserSnapshot, exportedAt = new Date().toISOString()): PortableWorkspace {
  const normalized = normalizeSnapshot(snapshot);
  const tabLocalIdsByNativeId = new Map<number, string>();
  const windows: PortableWindowWithGroups[] = [];

  normalized.windows.forEach((window, windowIndex) => {
    const sourceTabs = normalized.tabs
      .filter((tab) => tab.windowId === window.id)
      .sort((left, right) => left.index - right.index || left.id - right.id);
    const sourceGroups = normalized.groups
      .filter((group) => group.windowId === window.id)
      .sort((left, right) => left.id - right.id);
    const windowLocalId = `window-${windowIndex}`;
    const groupLocalIds = new Map<number, string>();

    sourceGroups.forEach((group, groupIndex) => {
      const localId = `group-${windowIndex}-${groupIndex}`;
      groupLocalIds.set(group.id, localId);
    });

    sourceTabs.forEach((tab, tabIndex) => {
      tabLocalIdsByNativeId.set(tab.id, `tab-${windowIndex}-${tabIndex}`);
    });

    const tabs = sourceTabs.map((tab, tabIndex) =>
      toPortableTab(tab, `tab-${windowIndex}-${tabIndex}`, groupLocalIds, tabLocalIdsByNativeId)
    );
    const groups = sourceGroups.map((group, groupIndex) => ({
      localId: `group-${windowIndex}-${groupIndex}`,
      title: group.title,
      color: group.color,
      collapsed: group.collapsed,
      tabLocalIds: sourceTabs
        .filter((tab) => tab.groupId === group.id)
        .map((tab) => tabLocalIdsByNativeId.get(tab.id))
        .filter((localId): localId is string => localId !== undefined)
    }));

    windows.push({
      localId: windowLocalId,
      type: window.type,
      incognito: window.incognito,
      state: window.state,
      tabs,
      groups
    });
  });

  const activeWindow = normalized.windows.find((window) => window.focused);
  const activeWindowIndex = activeWindow ? normalized.windows.findIndex((window) => window.id === activeWindow.id) : -1;

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    exportedAt,
    windows,
    activeWindowLocalId: activeWindowIndex === -1 ? undefined : `window-${activeWindowIndex}`
  };
}

function toPortableTab(
  tab: BrowserTabRecord,
  localId: string,
  groupLocalIds: Map<number, string>,
  tabLocalIdsByNativeId: Map<number, string>
): PortableTab {
  return {
    localId,
    index: tab.index,
    title: tab.title,
    url: tab.url,
    pendingUrl: tab.pendingUrl,
    pinned: tab.pinned,
    active: tab.active,
    groupLocalId: tab.groupId === -1 ? undefined : groupLocalIds.get(tab.groupId),
    openerLocalId: tab.openerTabId === undefined ? undefined : tabLocalIdsByNativeId.get(tab.openerTabId)
  };
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

function fnv1a(input: string): string {
  let hash = 0xcbf29ce484222325n;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, '0');
}
