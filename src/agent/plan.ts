import type { BrowserTabGroupColor, NativeGroupId, NativeTabId, NativeWindowId } from '../domain/types';
import type { AgentContextMetadata } from './metadata';

export interface AgentPlanTab {
  tabId: NativeTabId;
  windowId: NativeWindowId;
  title: string;
  url?: string;
  groupTitle?: string;
}

export type AgentPlanOperation =
  | { kind: 'create-group'; tabIds: NativeTabId[]; tabs?: AgentPlanTab[]; windowId: NativeWindowId; title: string; color: BrowserTabGroupColor; reason: string }
  | { kind: 'move-to-group'; tabIds: NativeTabId[]; tabs?: AgentPlanTab[]; targetGroupId: NativeGroupId; targetWindowId: NativeWindowId; targetGroupTitle?: string; reason: string }
  | { kind: 'rename-group'; groupId: NativeGroupId; title: string; reason: string }
  | { kind: 'close-tabs'; tabIds: NativeTabId[]; tabs?: AgentPlanTab[]; reason: string }
  | { kind: 'discard-tabs'; tabIds: NativeTabId[]; tabs?: AgentPlanTab[]; reason: string };

export interface AgentPlan {
  planId: string;
  planHash: string;
  baseRevision: string;
  baseRevisionInput: string;
  contextTabIds: NativeTabId[];
  operations: AgentPlanOperation[];
  highRisk: boolean;
  crossWindow: boolean;
  summary: string;
}

export function validateAgentPlan(
  value: unknown,
  context: AgentContextMetadata,
  groups: ReadonlyMap<NativeGroupId, { windowId: NativeWindowId; tabIds: NativeTabId[]; title?: string }>
): AgentPlan {
  if (!value || typeof value !== 'object') throw new Error('The model did not produce a plan.');
  const candidate = value as Partial<AgentPlan>;
  if (!Array.isArray(candidate.operations) || candidate.operations.length > 30) throw new Error('The Agent plan is invalid.');
  const allowedTabs = new Set(context.tabIds);
  const tabWindows = new Map(context.tabs.map((tab) => [tab.tabId, tab.windowId]));
  const operations = candidate.operations.map((operation) => validateOperation(operation, allowedTabs, tabWindows, context.tabs, groups));
  const crossWindow = operations.some((operation) => operation.kind === 'move-to-group' &&
    operation.tabIds.some((tabId) => context.tabs.find((tab) => tab.tabId === tabId)?.windowId !== operation.targetWindowId));
  const highRisk = operations.some((operation) => operation.kind === 'close-tabs' || operation.kind === 'discard-tabs');
  const summary = typeof candidate.summary === 'string' ? candidate.summary.slice(0, 500) : 'The Agent proposed browser organization changes.';
  const planId = typeof candidate.planId === 'string' && candidate.planId ? candidate.planId : crypto.randomUUID();
  const planHash = stableHash(JSON.stringify({ contextTabIds: context.tabIds, operations, base: context.revisionInput }));
  return { planId, planHash, baseRevision: context.revision, baseRevisionInput: context.revisionInput, contextTabIds: [...context.tabIds], operations, highRisk, crossWindow, summary };
}

function validateOperation(value: unknown, allowedTabs: ReadonlySet<NativeTabId>, tabWindows: ReadonlyMap<NativeTabId, NativeWindowId>, contextTabs: AgentContextMetadata['tabs'], groups: ReadonlyMap<NativeGroupId, { windowId: NativeWindowId; tabIds: NativeTabId[]; title?: string }>): AgentPlanOperation {
  if (!value || typeof value !== 'object') throw new Error('The Agent returned an invalid operation.');
  const operation = value as Record<string, unknown>;
  const reason = boundedText(operation.reason, 'An Agent-proposed organization change.');
  const tabIds = operation.kind === 'rename-group' ? [] : readTabIds(operation.tabIds, allowedTabs);
  const tabs = operation.kind === 'rename-group' ? [] : tabIds.map((tabId) => {
    const tab = contextTabs.find((candidate) => candidate.tabId === tabId);
    if (!tab) throw new Error(`Tab ${tabId} is outside the current Agent context.`);
    return { tabId: tab.tabId, windowId: tab.windowId, title: tab.title, url: tab.url, groupTitle: tab.groupTitle };
  });
  switch (operation.kind) {
    case 'create-group': {
      const windowId = readNumber(operation.windowId);
      if (tabIds.some((tabId) => tabWindows.get(tabId) !== windowId)) throw new Error('A new group must keep all tabs in one window.');
      return { kind: 'create-group', tabIds, tabs, windowId, title: boundedText(operation.title, 'New group'), color: readColor(operation.color), reason };
    }
    case 'move-to-group': {
      const targetGroupId = readNumber(operation.targetGroupId);
      const targetGroup = groups.get(targetGroupId);
      if (!targetGroup || targetGroup.windowId !== readNumber(operation.targetWindowId)) throw new Error(`Target group ${targetGroupId} is not available in the requested window.`);
      return { kind: 'move-to-group', tabIds, tabs, targetGroupId, targetWindowId: readNumber(operation.targetWindowId), targetGroupTitle: targetGroup.title, reason };
    }
    case 'rename-group': {
      const groupId = readNumber(operation.groupId);
      const group = groups.get(groupId);
      if (!group || group.tabIds.some((tabId) => !allowedTabs.has(tabId))) throw new Error(`Group ${groupId} is outside the current Agent context.`);
      return { kind: 'rename-group', groupId, title: boundedText(operation.title, 'Renamed group'), reason };
    }
    case 'close-tabs': return { kind: 'close-tabs', tabIds, tabs, reason };
    case 'discard-tabs': return { kind: 'discard-tabs', tabIds, tabs, reason };
    default: throw new Error('The Agent returned an unsupported operation.');
  }
}

function readTabIds(value: unknown, allowed: ReadonlySet<NativeTabId>): NativeTabId[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== 'number' || !allowed.has(id))) {
    throw new Error('Every proposed tab must belong to the current Agent context.');
  }
  return [...new Set(value as number[])];
}
function readNumber(value: unknown): number { if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error('The Agent returned an invalid browser ID.'); return value; }
function readColor(value: unknown): BrowserTabGroupColor {
  const colors: BrowserTabGroupColor[] = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  return colors.includes(value as BrowserTabGroupColor) ? value as BrowserTabGroupColor : 'grey';
}
function boundedText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : fallback; }
function stableHash(value: string): string { let hash = 0xcbf29ce484222325n; for (const char of value) { hash ^= BigInt(char.charCodeAt(0)); hash = BigInt.asUintN(64, hash * 0x100000001b3n); } return `plan:${hash.toString(16).padStart(16, '0')}`; }
