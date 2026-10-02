import type { BrowserSnapshot } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { createSnapshotRevision } from '../codex/snapshot';
import type { AgentPlan } from './plan';
import { consumeAgentConfirmation, type AgentConfirmation } from './confirmation';

export interface AgentApplyResult {
  operationId: string;
  status: 'succeeded' | 'partially-failed';
  results: Array<{ kind: string; status: 'succeeded' | 'failed'; message?: string }>;
  revision: string;
}

export async function applyAgentPlan(
  api: BrowserTabsApi,
  plan: AgentPlan,
  options: { confirmation: AgentConfirmation; configId: string; confirmHighRisk: boolean }
): Promise<AgentApplyResult> {
  if (plan.highRisk && !options.confirmHighRisk) {
    throw new Error('This proposal contains high-risk operations and requires explicit confirmation.');
  }
  consumeAgentConfirmation(options.confirmation, plan, options.configId);

  return api.runExclusive
    ? api.runExclusive((scoped) => applyInsideBoundary(scoped, plan, options))
    : applyInsideBoundary(api, plan, options);
}

async function applyInsideBoundary(
  api: BrowserTabsApi,
  plan: AgentPlan,
  options: { confirmation: AgentConfirmation; configId: string; confirmHighRisk: boolean }
): Promise<AgentApplyResult> {
  const current = await api.loadSnapshot();
  const currentRevision = createSnapshotRevision(current);
  if (currentRevision !== plan.baseRevision) {
    throw new Error('The browser changed after this proposal was reviewed. Analyze again before applying it.');
  }

  validateAgainstCurrentSnapshot(plan, current);
  const results: AgentApplyResult['results'] = [];
  for (const operation of plan.operations) {
    try {
      switch (operation.kind) {
        case 'create-group':
          await api.createGroup(operation.tabIds, operation.windowId, operation.title, operation.color);
          break;
        case 'move-to-group':
          await api.moveTabsToGroup(operation.tabIds, operation.targetGroupId, operation.targetWindowId);
          break;
        case 'rename-group':
          await api.updateGroup(operation.groupId, { title: operation.title });
          break;
        case 'close-tabs':
          await api.closeTabs(operation.tabIds);
          break;
        case 'discard-tabs':
          await api.discardTabs(operation.tabIds);
          break;
      }
      results.push({ kind: operation.kind, status: 'succeeded' });
    } catch (error) {
      results.push({ kind: operation.kind, status: 'failed', message: error instanceof Error ? error.message : 'Operation failed.' });
      break;
    }
  }

  const after = await api.loadSnapshot();
  const status = results.every((result) => result.status === 'succeeded') ? 'succeeded' : 'partially-failed';
  return { operationId: options.confirmation.confirmationId, status, results, revision: createSnapshotRevision(after) };
}

function validateAgainstCurrentSnapshot(plan: AgentPlan, snapshot: BrowserSnapshot): void {
  const tabIds = new Set(snapshot.tabs.map((tab) => tab.id));
  const groups = new Map(snapshot.groups.map((group) => [group.id, group]));
  const windows = new Map(snapshot.windows.map((window) => [window.id, window]));
  for (const tabId of plan.contextTabIds) {
    if (!tabIds.has(tabId)) throw new Error(`Tab ${tabId} is no longer available.`);
  }
  for (const operation of plan.operations) {
    if ('tabIds' in operation) {
      for (const tabId of operation.tabIds) {
        if (!tabIds.has(tabId)) throw new Error(`Tab ${tabId} is no longer available.`);
      }
    }
    if (operation.kind === 'create-group' && windows.get(operation.windowId)?.type !== 'normal') {
      throw new Error(`Target window ${operation.windowId} is no longer a normal browser window.`);
    }
    if (operation.kind === 'move-to-group') {
      const group = groups.get(operation.targetGroupId);
      if (!group || group.windowId !== operation.targetWindowId || windows.get(operation.targetWindowId)?.type !== 'normal') {
        throw new Error(`Target group ${operation.targetGroupId} is no longer available in the requested window.`);
      }
    }
    if (operation.kind === 'rename-group' && !groups.has(operation.groupId)) {
      throw new Error(`Group ${operation.groupId} is no longer available.`);
    }
  }
}
