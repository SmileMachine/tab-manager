import type { BrowserSnapshotView, BrowserTabRecord, NativeTabId, NativeWindowId } from '../domain/types';

export const AGENT_MAX_TABS = 200;
export const AGENT_MAX_METADATA_BYTES = 64 * 1024;
export const AGENT_MAX_TITLE_LENGTH = 240;
export const AGENT_MAX_PATH_LENGTH = 300;

/** The Agent has one implicit context: all eligible tabs in normal windows. */
export interface AgentContextMetadata {
  tabIds: NativeTabId[];
  tabs: AgentTabMetadata[];
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
  if (eligibleTabs.length > AGENT_MAX_TABS) {
    throw new Error(`The Agent context contains more than ${AGENT_MAX_TABS} tabs. Search or narrow the browser session before asking the Agent to organize it.`);
  }

  const groups = new Map(view.windows.flatMap((window) => window.groupSpans.map((group) => [group.groupId, group])));
  const tabs = eligibleTabs.map(({ item }) => toMetadata(item.tab, groups.get(item.tab.groupId)));
  const serialized = JSON.stringify({ tabs });
  const serializedBytes = new TextEncoder().encode(serialized).byteLength;
  if (serializedBytes > AGENT_MAX_METADATA_BYTES) {
    throw new Error(`The Agent metadata exceeds the ${AGENT_MAX_METADATA_BYTES} byte limit.`);
  }

  return {
    tabIds: tabs.map((tab) => tab.tabId),
    tabs,
    revisionInput: serialized,
    revision: revision ?? `agent:${stableHash(serialized)}`,
    serializedBytes
  };
}

export function tabIdsInContext(context: AgentContextMetadata): ReadonlySet<NativeTabId> {
  return new Set(context.tabIds);
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
