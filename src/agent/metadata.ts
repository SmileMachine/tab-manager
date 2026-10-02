import type { BrowserSnapshotView, BrowserTabRecord, NativeTabId, NativeWindowId } from '../domain/types';

export const AGENT_MAX_TITLE_LENGTH = 240;
export const AGENT_MAX_PATH_LENGTH = 300;
const AGENT_MAX_SUMMARY_GROUPS = 80;
const AGENT_MAX_SUMMARY_LENGTH = 2400;

/** The Agent has one implicit context: all eligible tabs in normal windows. */
export interface AgentContextMetadata {
  tabIds: NativeTabId[];
  tabs: AgentTabMetadata[];
  summary: string;
  revisionInput: string;
  revision: string;
  serializedBytes: number;
}

export interface AgentTabMetadata {
  tabId: NativeTabId;
  windowId: NativeWindowId;
  index: number;
  title: string;
  url?: string;
  groupId?: number;
  groupTitle?: string;
  pinned: boolean;
  active: boolean;
}

export function buildAgentContextMetadata(view: BrowserSnapshotView, revision?: string): AgentContextMetadata {
  const eligibleTabs = view.windows.flatMap((window) => {
    if (window.type !== 'normal') return [];
    return window.items
      .filter((item) => !item.tab.incognito && !item.tab.isInternalPage)
      .map((item) => ({ item, window }));
  });

  if (eligibleTabs.length === 0) throw new Error('The Agent context contains no eligible tabs.');

  const groups = new Map(view.windows.flatMap((window) => window.groupSpans.map((group) => [group.groupId, group])));
  const tabs = eligibleTabs.map(({ item }) => toMetadata(item.tab, groups.get(item.tab.groupId)));
  const serialized = JSON.stringify({ tabs });
  const serializedBytes = new TextEncoder().encode(serialized).byteLength;
  const summary = buildContextSummary(view, tabs);

  return {
    tabIds: tabs.map((tab) => tab.tabId),
    tabs,
    summary,
    revisionInput: serialized,
    revision: revision ?? `agent:${stableHash(serialized)}`,
    serializedBytes
  };
}

export function tabIdsInContext(context: AgentContextMetadata): ReadonlySet<NativeTabId> {
  return new Set(context.tabIds);
}

function buildContextSummary(view: BrowserSnapshotView, eligibleTabs: AgentTabMetadata[]): string {
  const eligibleByWindow = new Map<NativeWindowId, AgentTabMetadata[]>();
  for (const tab of eligibleTabs) {
    const current = eligibleByWindow.get(tab.windowId) ?? [];
    current.push(tab);
    eligibleByWindow.set(tab.windowId, current);
  }
  const groups = view.windows.flatMap((window) => window.groupSpans.map((group) => ({
    windowId: window.id,
    groupId: group.groupId,
    title: group.title?.trim() || '(untitled group)',
    tabCount: group.tabIds.filter((tabId) => eligibleTabs.some((tab) => tab.tabId === tabId)).length
  }))).filter((group) => group.tabCount > 0);
  const focusedWindow = view.windows.find((window) => window.focused);
  const windowLines = view.windows
    .filter((window) => window.type === 'normal')
    .map((window) => {
      const tabs = eligibleByWindow.get(window.id) ?? [];
      const marker = window.id === focusedWindow?.id ? ', focused' : '';
      const windowGroups = groups.filter((group) => group.windowId === window.id).map((group) => `${group.title} (#${group.groupId}, ${group.tabCount} tabs)`);
      return `- Window ${window.id}${marker}: ${tabs.length} eligible tabs${windowGroups.length ? `; groups: ${windowGroups.join(', ')}` : '; no groups'}`;
    });
  const groupOverflow = groups.length > AGENT_MAX_SUMMARY_GROUPS ? `; ${groups.length - AGENT_MAX_SUMMARY_GROUPS} more groups omitted` : '';
  const groupLines = groups.slice(0, AGENT_MAX_SUMMARY_GROUPS).map((group) => `- ${group.title} (#${group.groupId}) in window ${group.windowId}: ${group.tabCount} tabs`);
  const summary = [
    '[Current browser summary]',
    `Eligible tabs: ${eligibleTabs.length}; normal windows: ${view.windows.filter((window) => window.type === 'normal').length}; focused window: ${focusedWindow?.id ?? 'unknown'}.`,
    ...windowLines,
    `Groups (${groups.length})${groupOverflow}:`,
    ...(groupLines.length ? groupLines : ['- None']),
    'Use this summary for orientation. Call search_tabs or read_tabs when exact tab records are needed.'
  ].join('\n');
  return summary.length > AGENT_MAX_SUMMARY_LENGTH ? `${summary.slice(0, AGENT_MAX_SUMMARY_LENGTH - 1)}…` : summary;
}

function toMetadata(tab: BrowserTabRecord, group: { groupId: number; title?: string } | undefined): AgentTabMetadata {
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: truncate(tab.title || '(untitled)', AGENT_MAX_TITLE_LENGTH),
    url: sanitizeUrl(tab.url ?? tab.pendingUrl),
    groupId: group?.groupId,
    groupTitle: group?.title ? truncate(group.title, AGENT_MAX_TITLE_LENGTH) : undefined,
    pinned: tab.pinned,
    active: tab.active
  };
}

export function sanitizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return `${url.origin}${truncate(url.pathname || '/', AGENT_MAX_PATH_LENGTH)}`;
  } catch {
    return undefined;
  }
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of value) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
