import type { BrowserSnapshotView, BrowserTabGroupRecord, BrowserTabRecord, NativeTabId, NativeWindowId } from '../domain/types';

export const AGENT_MAX_TABS = 200;
export const AGENT_MAX_METADATA_BYTES = 64 * 1024;
export const AGENT_MAX_TITLE_LENGTH = 240;
export const AGENT_MAX_PATH_LENGTH = 300;

export type AgentScope =
  | { kind: 'selected'; tabIds: NativeTabId[]; allowCrossWindow?: boolean }
  | { kind: 'current-window'; windowId: NativeWindowId; allowCrossWindow?: boolean };

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

export interface AgentScopeMetadata {
  scope: AgentScope;
  tabIds: NativeTabId[];
  tabs: AgentTabMetadata[];
  revisionInput: string;
  revision: string;
  serializedBytes: number;
}

export function buildAgentScopeMetadata(view: BrowserSnapshotView, scope: AgentScope, revision?: string): AgentScopeMetadata {
  const eligibleTabs = view.windows.flatMap((window) => {
    if (window.type !== 'normal') return [];
    return window.items
      .filter((item) => !item.tab.incognito && !item.tab.isInternalPage)
      .map((item) => ({ item, window }));
  });
  const selectedIds = scope.kind === 'selected'
    ? new Set(scope.tabIds)
    : undefined;
  const scoped = eligibleTabs.filter(({ item, window }) => {
    if (scope.kind === 'current-window' && window.id !== scope.windowId) return false;
    return selectedIds ? selectedIds.has(item.tab.id) : true;
  });

  if (scoped.length === 0) throw new Error('The Agent scope contains no eligible tabs.');
  if (scoped.length > AGENT_MAX_TABS) throw new Error(`The Agent scope contains more than ${AGENT_MAX_TABS} tabs.`);

  const groups = new Map(view.windows.flatMap((window) => window.groupSpans.map((group) => [group.groupId, group])));
  const tabs = scoped.map(({ item }) => toMetadata(item.tab, groups.get(item.tab.groupId)));
  const serialized = JSON.stringify({ scope, tabs });
  const serializedBytes = new TextEncoder().encode(serialized).byteLength;
  if (serializedBytes > AGENT_MAX_METADATA_BYTES) {
    throw new Error(`The Agent metadata exceeds the ${AGENT_MAX_METADATA_BYTES} byte limit.`);
  }

  return {
    scope,
    tabIds: tabs.map((tab) => tab.tabId),
    tabs,
    revisionInput: serialized,
    revision: revision ?? `agent:${stableHash(serialized)}`,
    serializedBytes
  };
}

export function tabIdsInScope(scope: AgentScopeMetadata): ReadonlySet<NativeTabId> {
  return new Set(scope.tabIds);
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
