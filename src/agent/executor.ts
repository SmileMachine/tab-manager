import type { BrowserSnapshot } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { createSnapshotRevision } from '../codex/snapshot';
import type { AgentPlan } from './plan';
import { consumeAgentConfirmation, type AgentConfirmation } from './confirmation';

export interface AgentApplyResult {
  operationId: string;
  status: 'succeeded' | 'partially-applied' | 'failed';
  results: Array<{ operationIndex: number; kind: string; status: 'succeeded' | 'skipped' | 'failed'; message?: string }>;
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
  const plannedSnapshot = await api.loadSnapshot();
  const currentRevision = createSnapshotRevision(plannedSnapshot);
  if (currentRevision !== plan.baseRevision) {
    console.warn('[Tab Group Manager] Agent proposal revision changed before apply; applying still-available operations.', {
      planId: plan.planId,
      plannedRevision: plan.baseRevision,
      currentRevision
    });
  }

  const results: AgentApplyResult['results'] = [];
  for (const operation of plan.operations) {
    const current = await api.loadSnapshot();
    const preparation = prepareOperation(operation, current);
    if (preparation.status === 'skipped') {
      console.warn('[Tab Group Manager] Agent operation skipped.', {
        planId: plan.planId,
        operation: operation.kind,
        message: preparation.message
      });
      results.push({ operationIndex: results.length, kind: operation.kind, status: 'skipped', message: preparation.message });
      continue;
    }
    try {
      if (preparation.message) {
        console.warn('[Tab Group Manager] Agent operation applied with skipped tabs.', {
          planId: plan.planId,
          operation: operation.kind,
          message: preparation.message
        });
      }
      switch (operation.kind) {
        case 'create-group':
          await api.createGroup(preparation.tabIds, operation.windowId, operation.title, operation.color);
          break;
        case 'move-to-group':
          await api.moveTabsToGroup(preparation.tabIds, operation.targetGroupId, operation.targetWindowId);
          break;
        case 'rename-group':
          await api.updateGroup(operation.groupId, { title: operation.title });
          break;
        case 'close-tabs':
          await api.closeTabs(preparation.tabIds);
          break;
        case 'discard-tabs':
          await api.discardTabs(preparation.tabIds);
          break;
      }
      results.push({ operationIndex: results.length, kind: operation.kind, status: 'succeeded', message: preparation.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Operation failed.';
      console.error('[Tab Group Manager] Agent operation failed.', { planId: plan.planId, operation: operation.kind, message, error });
      results.push({ operationIndex: results.length, kind: operation.kind, status: 'failed', message });
    }
  }

  const after = await api.loadSnapshot();
  const hasFailure = results.some((result) => result.status === 'failed');
  const hasSkipped = results.some((result) => result.status === 'skipped');
  const hasSuccess = results.some((result) => result.status === 'succeeded');
  const hasNotices = results.some((result) => Boolean(result.message));
  const status: AgentApplyResult['status'] = hasFailure
    ? hasSuccess || hasSkipped ? 'partially-applied' : 'failed'
    : hasSkipped || hasNotices ? 'partially-applied' : 'succeeded';
  if (hasSkipped) {
    console.info('[Tab Group Manager] Agent proposal applied with skipped operations.', {
      planId: plan.planId,
      skipped: results.filter((result) => result.status === 'skipped')
    });
  }
  return { operationId: options.confirmation.confirmationId, status, results, revision: createSnapshotRevision(after) };
}

type PreparedOperation = { status: 'ready'; tabIds: number[]; message?: string } | { status: 'skipped'; message: string };

function prepareOperation(operation: AgentPlan['operations'][number], snapshot: BrowserSnapshot): PreparedOperation {
  const tabIds = new Set(snapshot.tabs.map((tab) => tab.id));
  const windows = new Map(snapshot.windows.map((window) => [window.id, window]));
  const groups = new Map(snapshot.groups.map((group) => [group.id, group]));
  if (operation.kind === 'rename-group') {
    if (!groups.has(operation.groupId)) return { status: 'skipped', message: `Group ${operation.groupId} is no longer available.` };
    return { status: 'ready', tabIds: [] };
  }
  const missingTabIds = operation.tabIds.filter((tabId) => !tabIds.has(tabId));
  const availableTabIds = operation.tabIds.filter((tabId) => tabIds.has(tabId));
  if (availableTabIds.length === 0) {
    return { status: 'skipped', message: missingTabIds.length > 0 ? `Tabs ${missingTabIds.join(', ')} are no longer available.` : 'All tabs in this operation are no longer available.' };
  }
  const tabNotice = missingTabIds.length > 0 ? `Skipped unavailable tabs: ${missingTabIds.join(', ')}.` : undefined;
  if (operation.kind === 'create-group') {
    if (windows.get(operation.windowId)?.type !== 'normal') return { status: 'skipped', message: `Target window ${operation.windowId} is no longer available.` };
    const wrongWindowTab = snapshot.tabs.find((tab) => availableTabIds.includes(tab.id) && tab.windowId !== operation.windowId);
    if (wrongWindowTab) return { status: 'skipped', message: `Tab ${wrongWindowTab.id} is no longer in target window ${operation.windowId}.` };
  }
  if (operation.kind === 'move-to-group') {
    const group = groups.get(operation.targetGroupId);
    if (!group || group.windowId !== operation.targetWindowId || windows.get(operation.targetWindowId)?.type !== 'normal') {
      return { status: 'skipped', message: `Target group ${operation.targetGroupId} is no longer available.` };
    }
  }
  return { status: 'ready', tabIds: availableTabIds, message: tabNotice };
}
