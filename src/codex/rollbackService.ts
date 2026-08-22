import type { BrowserSnapshot, BrowserTabGroupRecord, BrowserTabRecord, NativeTabId, NativeWindowId } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import type { OperationJournal, WorkspaceSnapshotRecord } from './operationJournal';
import { createSnapshotEnvelope } from './snapshot';
import type {
  CodexRpcError,
  CodexRpcRequest,
  CodexRpcResponse,
  PortableGroup,
  PortableTab,
  PortableWindowWithGroups,
  RollbackChange,
  RollbackPreview,
  RollbackResult,
  WorkspaceImportMode
} from './protocol';
import { CODEX_PROTOCOL_VERSION, createRpcError, isCodexRpcRequest } from './protocol';

export interface RollbackServices {
  api: BrowserTabsApi;
  journal: OperationJournal;
}

interface RollbackParams {
  operationId?: string;
  checkpointId?: string;
  snapshotId?: string;
  expectedRevision?: string;
  confirm: boolean;
  dryRun: boolean;
  closeExtraTabs: boolean;
}

interface TargetResolution {
  snapshot: WorkspaceSnapshotRecord;
  targetName: string;
}

interface WorkspaceMapping {
  windows: Map<string, NativeWindowId>;
  tabs: Map<string, NativeTabId>;
  groups: Map<string, number>;
  usedTabIds: Set<NativeTabId>;
}

export const CODEX_ROLLBACK_METHODS = [
  'tab_group.preview_rollback',
  'tab_group.rollback_operation'
] as const;

export function isCodexRollbackMethod(value: unknown): value is (typeof CODEX_ROLLBACK_METHODS)[number] {
  return typeof value === 'string' && (CODEX_ROLLBACK_METHODS as readonly string[]).includes(value);
}

export async function handleCodexRollbackRequest(
  request: unknown,
  services: RollbackServices
): Promise<CodexRpcResponse<unknown>> {
  if (!isCodexRpcRequest(request) || !isCodexRollbackMethod(request.method)) {
    return createRpcError(requestIdOf(request), { code: 'unknown-method', message: 'The requested rollback method is not available.' });
  }

  const params = parseParams(request);
  if (!params) return createRpcError(request.requestId, { code: 'invalid-params', message: 'Rollback request parameters are invalid.' });

  try {
    const target = await resolveTarget(params, services.journal);
    if (!target) return createRpcError(request.requestId, { code: 'not-found', message: 'The rollback target was not found.' });

    const current = await services.api.loadSnapshot();
    const currentEnvelope = createSnapshotEnvelope(current, { fieldSet: 'full' });
    if (params.expectedRevision && params.expectedRevision !== currentEnvelope.revision) {
      return createRpcError(request.requestId, {
        code: 'stale-state',
        message: 'The browser state changed after the rollback was planned.',
        details: { currentRevision: currentEnvelope.revision }
      });
    }

    const preview = buildRollbackPreview(current, target.snapshot, params.closeExtraTabs);
    if (request.method === 'tab_group.preview_rollback' || params.dryRun) return success(request, preview);
    if (!preview.changes.length) {
      return success(request, {
        operationId: undefined,
        restoredSnapshotId: target.snapshot.snapshotId,
        revision: currentEnvelope.revision,
        warnings: preview.warnings,
        changes: []
      } satisfies Partial<RollbackResult>);
    }
    if (preview.requiresConfirmation && !params.confirm) {
      return createRpcError(request.requestId, {
        code: 'confirmation-required',
        message: 'Rollback changes browser state and requires confirm: true.',
        details: preview as never
      });
    }

    const record = await services.journal.begin({
      source: 'rollback',
      operationType: 'rollback',
      beforeSnapshot: current,
      expectedRevision: params.expectedRevision,
      requestSummary: { targetSnapshotId: target.snapshot.snapshotId, targetName: target.targetName, closeExtraTabs: params.closeExtraTabs }
    });

    const outcome = await restoreWorkspace(services.api, target.snapshot.workspace.windows, params.closeExtraTabs);
    const after = await services.api.loadSnapshot();
    const warnings = [...preview.warnings, ...outcome.warnings];
    await services.journal.complete(record, {
      afterSnapshot: after,
      status: outcome.errors.length ? 'partially-failed' : 'rolled-back',
      warnings,
      errors: outcome.errors,
      revertsOperationId: params.operationId
    });

    const result: RollbackResult = {
      operationId: record.operationId,
      restoredSnapshotId: target.snapshot.snapshotId,
      revision: createSnapshotEnvelope(after, { fieldSet: 'full' }).revision,
      warnings,
      changes: outcome.changes
    };
    return success(request, result);
  } catch (error) {
    return createRpcError(request.requestId, {
      code: 'operation-failed',
      message: error instanceof Error ? error.message : 'Unable to rollback browser state.'
    });
  }
}

function buildRollbackPreview(current: BrowserSnapshot, target: WorkspaceSnapshotRecord, closeExtraTabs: boolean): RollbackPreview {
  const targetWorkspace = target.workspace.windows;
  const mapping = mapWorkspace(current, targetWorkspace);
  const changes: RollbackChange[] = [];
  const warnings: string[] = [];

  if (targetWorkspace.length > current.windows.length) {
    warnings.push('The target contains more windows than the current browser state; missing windows will be created only when the browser adapter supports it.');
  }

  for (const window of targetWorkspace) {
    const windowId = mapping.windows.get(window.localId);
    for (const tab of window.tabs) {
      const nativeId = mapping.tabs.get(tab.localId);
      if (nativeId === undefined) {
        changes.push({ kind: 'create-tab', targetLocalId: tab.localId, message: `Create tab ${tab.title ?? tab.url ?? tab.localId}.`, reversible: true });
      } else {
        const currentTab = current.tabs.find((candidate) => candidate.id === nativeId);
        if (currentTab && currentTab.windowId !== windowId) {
          changes.push({ kind: 'move-tab', targetLocalId: tab.localId, nativeId, message: `Move tab ${nativeId} to its target window.`, reversible: true });
        }
        if (currentTab && currentTab.pinned !== tab.pinned) {
          changes.push({ kind: 'update-tab', targetLocalId: tab.localId, nativeId, message: `Restore pinned state for tab ${nativeId}.`, reversible: true });
        }
      }
      if (tab.active && nativeId !== undefined) changes.push({ kind: 'activate-tab', targetLocalId: tab.localId, nativeId, message: `Activate tab ${nativeId}.`, reversible: true });
    }

    for (const group of window.groups) {
      const nativeGroupId = mapping.groups.get(group.localId);
      if (nativeGroupId === undefined) {
        changes.push({ kind: 'create-group', targetLocalId: group.localId, message: `Create group ${group.title ?? group.localId}.`, reversible: true });
      } else {
        changes.push({ kind: 'update-group', targetLocalId: group.localId, nativeId: nativeGroupId, message: `Restore metadata for group ${nativeGroupId}.`, reversible: true });
      }
      for (const tabLocalId of group.tabLocalIds) {
        const tabId = mapping.tabs.get(tabLocalId);
        if (tabId !== undefined) changes.push({ kind: 'move-tab-to-group', targetLocalId: tabLocalId, nativeId: tabId, message: `Restore group membership for tab ${tabId}.`, reversible: true });
      }
    }
  }

  const targetTabLocals = new Set(targetWorkspace.flatMap((window) => window.tabs.map((tab) => tab.localId)));
  const mappedTargetTabIds = new Set(mapping.tabs.values());
  if (closeExtraTabs) {
    for (const currentTab of current.tabs) {
      if (!mappedTargetTabIds.has(currentTab.id)) {
        changes.push({ kind: 'close-tab', nativeId: currentTab.id, message: `Close extra tab ${currentTab.id}.`, reversible: false });
      }
    }
  } else if (current.tabs.length > targetTabLocals.size) {
    warnings.push('Extra current tabs will remain open because closeExtraTabs is false.');
  }

  if (current.windows.some((window) => window.incognito) || targetWorkspace.some((window) => window.incognito)) {
    warnings.push('Incognito window state and private page process state cannot be fully restored.');
  }
  warnings.push('Form values, scroll positions, page process state, and browser-internal pages cannot be fully restored from a portable snapshot.');

  return {
    targetSnapshotId: target.snapshotId,
    currentRevision: createSnapshotEnvelope(current, { fieldSet: 'full' }).revision,
    targetRevision: target.revision,
    targetWindowCount: targetWorkspace.length,
    targetTabCount: targetWorkspace.reduce((count, window) => count + window.tabs.length, 0),
    targetGroupCount: targetWorkspace.reduce((count, window) => count + window.groups.length, 0),
    changes,
    warnings,
    requiresConfirmation: changes.length > 0
  };
}

async function restoreWorkspace(api: BrowserTabsApi, windows: PortableWindowWithGroups[], closeExtraTabs: boolean) {
  const current = await api.loadSnapshot();
  const mapping = mapWorkspace(current, windows);
  const warnings: string[] = [];
  const errors: string[] = [];
  const changes: RollbackChange[] = [];
  const windowIds = new Map(mapping.windows);

  for (const targetWindow of windows) {
    let windowId = windowIds.get(targetWindow.localId);
    if (windowId === undefined && api.createWindow) {
      try {
        windowId = await api.createWindow({
          type: targetWindow.type === 'normal' || targetWindow.type === 'popup' || targetWindow.type === 'panel' ? targetWindow.type : 'normal',
          incognito: targetWindow.incognito,
          state: targetWindow.state === 'normal' || targetWindow.state === 'minimized' || targetWindow.state === 'maximized' || targetWindow.state === 'fullscreen' ? targetWindow.state : undefined
        });
        windowIds.set(targetWindow.localId, windowId);
      } catch (error) {
        errors.push(errorMessage(error));
        continue;
      }
    }
    if (windowId === undefined) {
      warnings.push(`Window ${targetWindow.localId} could not be created; its tabs will not be restored.`);
      continue;
    }

    const tabIds = new Map<string, number>();
    const existingByLocal = mapTabsForWindow(current, targetWindow, windowId);
    for (const tab of targetWindow.tabs) {
      let tabId = existingByLocal.get(tab.localId);
      if (tabId === undefined && api.createTabs) {
        try {
          const created = await api.createTabs([{ windowId, index: -1, url: tab.url ?? tab.pendingUrl, pinned: tab.pinned, active: false }]);
          tabId = created[0];
        } catch (error) {
          errors.push(`Tab ${tab.localId}: ${errorMessage(error)}`);
        }
      }
      if (tabId === undefined) {
        warnings.push(`Tab ${tab.localId} could not be restored because the browser adapter cannot create it.`);
        continue;
      }
      tabIds.set(tab.localId, tabId);
      changes.push({ kind: existingByLocal.has(tab.localId) ? 'move-tab' : 'create-tab', targetLocalId: tab.localId, nativeId: tabId, message: `Restore tab ${tab.localId}.`, reversible: true });
      try {
        if (api.updateTab) await api.updateTab(tabId, { pinned: tab.pinned });
        if (api.moveTabs) await api.moveTabs([tabId], windowId, tab.index);
        else await api.moveTab(tabId, windowId, tab.index);
      } catch (error) {
        errors.push(`Tab ${tab.localId}: ${errorMessage(error)}`);
      }
      if (tab.active) {
        try { await api.activateTab(tabId, windowId); } catch (error) { errors.push(`Tab ${tab.localId}: ${errorMessage(error)}`); }
      }
    }

    for (const group of targetWindow.groups) {
      let groupId = findGroup(current, group, windowId);
      if (groupId === undefined) {
        const groupedTabs = group.tabLocalIds.map((id) => tabIds.get(id)).filter((id): id is number => id !== undefined);
        if (groupedTabs.length && api.createGroup) {
          try { groupId = await api.createGroup(groupedTabs, windowId, group.title ?? '', group.color); } catch (error) { errors.push(`Group ${group.localId}: ${errorMessage(error)}`); }
        }
      }
      if (groupId === undefined) {
        warnings.push(`Group ${group.localId} could not be restored.`);
        continue;
      }
      try {
        await api.updateGroup(groupId, { title: group.title, color: group.color, collapsed: group.collapsed });
        const groupedTabs = group.tabLocalIds.map((id) => tabIds.get(id)).filter((id): id is number => id !== undefined);
        if (groupedTabs.length) await api.moveTabsToGroup(groupedTabs, groupId, windowId);
      } catch (error) { errors.push(`Group ${group.localId}: ${errorMessage(error)}`); }
      changes.push({ kind: 'update-group', targetLocalId: group.localId, nativeId: groupId, message: `Restore group ${group.localId}.`, reversible: true });
    }
  }

  if (closeExtraTabs) {
    const restoredIds = new Set<number>();
    const after = await api.loadSnapshot();
    for (const targetWindow of windows) {
      const windowId = windowIds.get(targetWindow.localId);
      if (windowId === undefined) continue;
      const restored = mapTabsForWindow(after, targetWindow, windowId);
      restored.forEach((id) => restoredIds.add(id));
    }
    const extras = after.tabs.filter((tab) => !restoredIds.has(tab.id)).map((tab) => tab.id);
    if (extras.length) {
      try { await api.closeTabs(extras); extras.forEach((id) => changes.push({ kind: 'close-tab', nativeId: id, message: `Close extra tab ${id}.`, reversible: false })); }
      catch (error) { errors.push(`Extra tabs: ${errorMessage(error)}`); }
    }
  }

  return { changes, warnings, errors };
}

function mapWorkspace(current: BrowserSnapshot, windows: PortableWindowWithGroups[]): WorkspaceMapping {
  const sortedWindows = [...current.windows].sort((a, b) => a.id - b.id);
  const windowMap = new Map<string, number>();
  windows.forEach((window, index) => {
    const candidate = sortedWindows[index];
    if (candidate) windowMap.set(window.localId, candidate.id);
  });
  const tabs = new Map<string, number>();
  const usedTabIds = new Set<number>();
  for (const window of windows) {
    const nativeWindowId = windowMap.get(window.localId);
    if (nativeWindowId === undefined) continue;
    const candidates = current.tabs.filter((tab) => tab.windowId === nativeWindowId && !usedTabIds.has(tab.id));
    for (const targetTab of window.tabs) {
      const candidate = chooseTab(candidates, targetTab);
      if (candidate) {
        tabs.set(targetTab.localId, candidate.id);
        usedTabIds.add(candidate.id);
        candidates.splice(candidates.indexOf(candidate), 1);
      }
    }
  }
  const groups = new Map<string, number>();
  for (const window of windows) {
    const nativeWindowId = windowMap.get(window.localId);
    if (nativeWindowId === undefined) continue;
    const candidates = current.groups.filter((group) => group.windowId === nativeWindowId);
    for (const targetGroup of window.groups) {
      const targetTabIds = new Set(targetGroup.tabLocalIds.map((localId) => tabs.get(localId)).filter((id): id is number => id !== undefined));
      const candidate = candidates.find((group) => group.title === targetGroup.title && group.color === targetGroup.color)
        ?? candidates.find((group) => group.color === targetGroup.color && current.tabs.some((tab) => tab.groupId === group.id && targetTabIds.has(tab.id)));
      if (candidate) groups.set(targetGroup.localId, candidate.id);
    }
  }
  return { windows: windowMap, tabs, groups, usedTabIds };
}

function mapTabsForWindow(current: BrowserSnapshot, targetWindow: PortableWindowWithGroups, windowId: number): Map<string, number> {
  const candidates = current.tabs.filter((tab) => tab.windowId === windowId);
  const result = new Map<string, number>();
  for (const targetTab of targetWindow.tabs) {
    const candidate = chooseTab(candidates, targetTab);
    if (candidate) { result.set(targetTab.localId, candidate.id); candidates.splice(candidates.indexOf(candidate), 1); }
  }
  return result;
}

function chooseTab(candidates: BrowserTabRecord[], target: PortableTab): BrowserTabRecord | undefined {
  const targetUrl = target.url ?? target.pendingUrl;
  const exact = candidates.find((candidate) => candidate.pinned === target.pinned && candidate.title === target.title && (candidate.url ?? candidate.pendingUrl) === targetUrl);
  return exact ?? candidates.find((candidate) => (candidate.url ?? candidate.pendingUrl) === targetUrl) ?? candidates.find((candidate) => candidate.title === target.title);
}

function findGroup(current: BrowserSnapshot, target: PortableGroup, windowId: number): number | undefined {
  return current.groups.find((group) => group.windowId === windowId && group.title === target.title && group.color === target.color)?.id
    ?? current.groups.find((group) => group.windowId === windowId && group.color === target.color)?.id;
}

async function resolveTarget(params: RollbackParams, journal: OperationJournal): Promise<TargetResolution | undefined> {
  if (params.snapshotId) {
    const snapshot = await journal.getSnapshot(params.snapshotId);
    return snapshot ? { snapshot, targetName: params.snapshotId } : undefined;
  }
  if (params.checkpointId) {
    const checkpoint = await journal.getCheckpoint(params.checkpointId);
    if (!checkpoint) return undefined;
    const snapshot = await journal.getSnapshot(checkpoint.snapshotId);
    return snapshot ? { snapshot, targetName: checkpoint.name } : undefined;
  }
  if (params.operationId) {
    const operation = await journal.getOperation(params.operationId);
    if (!operation) return undefined;
    const snapshotId = operation.beforeSnapshotId;
    const snapshot = await journal.getSnapshot(snapshotId);
    return snapshot ? { snapshot, targetName: operation.operationType } : undefined;
  }
  return undefined;
}

function parseParams(request: CodexRpcRequest): RollbackParams | undefined {
  if (!isRecord(request.params)) return undefined;
  const params = request.params as Record<string, any>;
  const refs = ['operationId', 'checkpointId', 'snapshotId'].filter((key) => typeof params[key] === 'string');
  if (refs.length !== 1 || refs.some((key) => params[key] !== undefined && typeof params[key] !== 'string')) return undefined;
  if (params.expectedRevision !== undefined && typeof params.expectedRevision !== 'string') return undefined;
  if (params.confirm !== undefined && typeof params.confirm !== 'boolean') return undefined;
  if (params.dryRun !== undefined && typeof params.dryRun !== 'boolean') return undefined;
  if (params.closeExtraTabs !== undefined && typeof params.closeExtraTabs !== 'boolean') return undefined;
  return {
    operationId: params.operationId as string | undefined,
    checkpointId: params.checkpointId as string | undefined,
    snapshotId: params.snapshotId as string | undefined,
    expectedRevision: params.expectedRevision as string | undefined,
    confirm: params.confirm === true,
    dryRun: params.dryRun === true,
    closeExtraTabs: params.closeExtraTabs === true
  };
}

function success<T>(request: CodexRpcRequest, result: T): CodexRpcResponse<T> {
  return { protocolVersion: CODEX_PROTOCOL_VERSION, requestId: request.requestId, result };
}

function requestIdOf(request: unknown): string { return isRecord(request) && typeof request.requestId === 'string' ? request.requestId : 'unknown'; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Browser operation failed.'; }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
