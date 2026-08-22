import type { BrowserSnapshot, BrowserTabGroupColor, BrowserWindowType, NativeTabId, NativeWindowId } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import type { OperationJournal } from './operationJournal';
import { createSnapshotEnvelope } from './snapshot';
import {
  CODEX_PROTOCOL_VERSION,
  createRpcError,
  isCodexRpcRequest,
  type CodexRpcRequest,
  type CodexRpcResponse,
  type PortableGroup,
  type PortableTab,
  type PortableWindowWithGroups,
  type PortableWorkspace,
  type WorkspaceImportItem,
  type WorkspaceImportMode,
  type WorkspaceImportPreview,
  type WorkspaceImportResult
} from './protocol';

export const CODEX_IMPORT_METHODS = ['tab_group.preview_import', 'tab_group.import_workspace'] as const;

export interface ImportServices {
  api: BrowserTabsApi;
  journal: OperationJournal;
}

interface ImportParams {
  workspace: PortableWorkspace;
  mode: WorkspaceImportMode;
  expectedRevision?: string;
  confirm: boolean;
  dryRun: boolean;
}

export function isCodexImportMethod(value: unknown): value is (typeof CODEX_IMPORT_METHODS)[number] {
  return typeof value === 'string' && (CODEX_IMPORT_METHODS as readonly string[]).includes(value);
}

export async function handleCodexImportRequest(
  request: unknown,
  services: ImportServices
): Promise<CodexRpcResponse<unknown>> {
  if (!isCodexRpcRequest(request) || !isCodexImportMethod(request.method)) {
    return createRpcError(requestIdOf(request), { code: 'unknown-method', message: 'The requested workspace import method is not available.' });
  }

  const params = parseParams(request);
  if (!params) return createRpcError(request.requestId, { code: 'invalid-params', message: 'Workspace import parameters are invalid.' });
  const validation = validateWorkspace(params.workspace);
  if (!validation.valid) {
    const preview = createPreview(params, validation.errors, validation.warnings);
    return request.method === 'tab_group.preview_import'
      ? success(request, preview)
      : createRpcError(request.requestId, { code: 'invalid-params', message: 'The workspace document is invalid.', details: preview as never });
  }

  try {
    const before = await services.api.loadSnapshot();
    const currentEnvelope = createSnapshotEnvelope(before, { fieldSet: 'full' });
    if (params.expectedRevision && params.expectedRevision !== currentEnvelope.revision) {
      return createRpcError(request.requestId, {
        code: 'stale-state',
        message: 'The browser state changed after the workspace import was planned.',
        details: { currentRevision: currentEnvelope.revision }
      });
    }

    const preview = createPreview(params, [], validation.warnings, before);
    if (request.method === 'tab_group.preview_import' || params.dryRun) return success(request, preview);
    if (!params.confirm) {
      return createRpcError(request.requestId, {
        code: 'confirmation-required',
        message: 'Workspace import changes browser state and requires confirm: true.',
        details: preview as never
      });
    }

    const record = await services.journal.begin({
      source: 'import',
      operationType: `importWorkspace:${params.mode}`,
      beforeSnapshot: before,
      expectedRevision: params.expectedRevision,
      requestSummary: { mode: params.mode, windowCount: params.workspace.windows.length, tabCount: countTabs(params.workspace) }
    });
    const outcome = await importWorkspace(services.api, params.workspace, params.mode, before);
    const after = await services.api.loadSnapshot();
    const warnings = [...validation.warnings, ...outcome.warnings];
    const status = outcome.errors.length ? 'partially-failed' : 'succeeded';
    await services.journal.complete(record, { afterSnapshot: after, status, warnings, errors: outcome.errors });

    const result: WorkspaceImportResult = {
      operationId: record.operationId,
      mode: params.mode,
      windowIdMap: outcome.windowIdMap,
      tabIdMap: outcome.tabIdMap,
      groupIdMap: outcome.groupIdMap,
      skipped: outcome.skipped,
      warnings,
      snapshot: createSnapshotEnvelope(after, { fieldSet: 'full' })
    };
    return success(request, result);
  } catch (error) {
    return createRpcError(request.requestId, { code: 'operation-failed', message: errorMessage(error) });
  }
}

function createPreview(params: ImportParams, errors: string[], warnings: string[], current?: BrowserSnapshot): WorkspaceImportPreview {
  const items: WorkspaceImportItem[] = [];
  for (const window of params.workspace.windows) {
    items.push({ kind: 'window', localId: window.localId, status: 'create', message: `Create or select window ${window.localId}.` });
    for (const tab of window.tabs) items.push({ kind: 'tab', localId: tab.localId, status: 'create', message: `Create tab ${tab.title ?? tab.url ?? tab.localId}.` });
    for (const group of window.groups) {
      const status = group.tabLocalIds.length ? 'create' : 'skip';
      items.push({ kind: 'group', localId: group.localId, status, message: status === 'create' ? `Create group ${group.title ?? group.localId}.` : 'Skip an empty native group.' });
    }
  }
  const resultWarnings = [...warnings];
  if (!params.mode || params.mode === 'append') resultWarnings.push('Append mode leaves existing tabs and windows unchanged.');
  if (params.mode === 'replace') {
    resultWarnings.push('Replace mode closes existing tabs after the imported workspace is created.');
    if (!current?.tabs.length) resultWarnings.push('The current browser has no tabs to replace.');
  }
  if (!current) resultWarnings.push('The preview has not loaded the current browser snapshot yet.');
  return { mode: params.mode, valid: errors.length === 0, requiresConfirmation: true, items, warnings: resultWarnings, errors };
}

function validateWorkspace(workspace: PortableWorkspace): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(workspace) || workspace.schemaVersion !== 1 || !Array.isArray(workspace.windows)) {
    return { valid: false, errors: ['schemaVersion must be 1 and windows must be an array.'], warnings };
  }
  const ids = new Set<string>();
  for (const window of workspace.windows) {
    if (!isRecord(window) || typeof window.localId !== 'string' || ids.has(window.localId)) errors.push('Window local IDs must be non-empty and unique.');
    else ids.add(window.localId);
    if (!isWindowType(window.type) || !Array.isArray(window.tabs) || !Array.isArray(window.groups)) errors.push(`Window ${window.localId ?? '<unknown>'} has invalid structure.`);
    for (const tab of window.tabs ?? []) {
      if (!isRecord(tab) || typeof tab.localId !== 'string' || ids.has(tab.localId)) errors.push('Tab local IDs must be non-empty and unique.');
      else ids.add(tab.localId);
      if (tab.url !== undefined && !isValidUrl(tab.url)) errors.push(`Tab ${tab.localId ?? '<unknown>'} has an invalid URL.`);
      if (tab.pendingUrl !== undefined && !isValidUrl(tab.pendingUrl)) errors.push(`Tab ${tab.localId ?? '<unknown>'} has an invalid pending URL.`);
      if (typeof tab.index !== 'number' || !Number.isInteger(tab.index) || tab.index < 0) errors.push(`Tab ${tab.localId ?? '<unknown>'} has an invalid index.`);
    }
    const tabIds = new Set((window.tabs ?? []).map((tab) => tab.localId));
    for (const group of window.groups ?? []) {
      if (!isRecord(group) || typeof group.localId !== 'string' || ids.has(group.localId)) errors.push('Group local IDs must be non-empty and unique.');
      else ids.add(group.localId);
      if (!isColor(group.color) || typeof group.collapsed !== 'boolean' || !Array.isArray(group.tabLocalIds)) errors.push(`Group ${group.localId ?? '<unknown>'} has invalid structure.`);
      for (const tabLocalId of group.tabLocalIds ?? []) if (!tabIds.has(tabLocalId)) errors.push(`Group ${group.localId ?? '<unknown>'} references a missing tab.`);
    }
  }
  if (!workspace.windows.length) warnings.push('The workspace contains no windows.');
  return { valid: errors.length === 0, errors, warnings };
}

async function importWorkspace(api: BrowserTabsApi, workspace: PortableWorkspace, mode: WorkspaceImportMode, before: BrowserSnapshot) {
  const windowIdMap: Record<string, number> = {};
  const tabIdMap: Record<string, number> = {};
  const groupIdMap: Record<string, number> = {};
  const skipped: WorkspaceImportItem[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const existingWindows = [...before.windows].sort((a, b) => a.id - b.id);

  for (const [index, sourceWindow] of workspace.windows.entries()) {
    let windowId: number | undefined;
    if (mode === 'append' && api.createWindow) {
      try { windowId = await api.createWindow({ type: toCreatableWindowType(sourceWindow.type), incognito: sourceWindow.incognito, state: toCreatableWindowState(sourceWindow.state) }); }
      catch (error) { errors.push(`Window ${sourceWindow.localId}: ${errorMessage(error)}`); }
    }
    if (windowId === undefined) windowId = existingWindows[index]?.id ?? existingWindows[0]?.id;
    if (windowId === undefined) {
      warnings.push(`Window ${sourceWindow.localId} was skipped because no target window is available.`);
      skipped.push({ kind: 'window', localId: sourceWindow.localId, status: 'skip', message: 'No target browser window is available.' });
      continue;
    }
    windowIdMap[sourceWindow.localId] = windowId;
    if (!api.createTabs) {
      warnings.push(`Window ${sourceWindow.localId} could not import tabs because the browser adapter does not support tab creation.`);
      continue;
    }
    for (const tab of [...sourceWindow.tabs].sort((a, b) => a.index - b.index)) {
      try {
        const created = await api.createTabs([{ windowId, index: mode === 'replace' ? tab.index : -1, url: tab.url ?? tab.pendingUrl, pinned: tab.pinned, active: false }]);
        const tabId = created[0];
        if (tabId === undefined) throw new Error('The browser did not return a created tab ID.');
        tabIdMap[tab.localId] = tabId;
        if (tab.active) await api.activateTab(tabId, windowId);
      } catch (error) {
        errors.push(`Tab ${tab.localId}: ${errorMessage(error)}`);
        skipped.push({ kind: 'tab', localId: tab.localId, status: 'skip', message: errorMessage(error) });
      }
    }
    for (const group of sourceWindow.groups) {
      const tabIds = group.tabLocalIds.map((localId) => tabIdMap[localId]).filter((id): id is number => id !== undefined);
      if (!tabIds.length) {
        skipped.push({ kind: 'group', localId: group.localId, status: 'skip', message: 'A native group requires at least one imported tab.' });
        continue;
      }
      try {
        const groupId = await api.createGroup(tabIds, windowId, group.title ?? '', group.color);
        groupIdMap[group.localId] = groupId;
        await api.updateGroup(groupId, { title: group.title, color: group.color, collapsed: group.collapsed });
      } catch (error) {
        errors.push(`Group ${group.localId}: ${errorMessage(error)}`);
        skipped.push({ kind: 'group', localId: group.localId, status: 'skip', message: errorMessage(error) });
      }
    }
    if (!api.createWindow && workspace.windows.length > 1) warnings.push('The browser adapter cannot create windows; multiple imported windows may share existing windows.');
  }

  if (mode === 'replace') {
    const importedTabIds = new Set(Object.values(tabIdMap));
    const extras = before.tabs.filter((tab) => !importedTabIds.has(tab.id)).map((tab) => tab.id);
    if (extras.length) {
      try { await api.closeTabs(extras); } catch (error) { errors.push(`Replace mode: ${errorMessage(error)}`); }
    }
  }
  return { windowIdMap, tabIdMap, groupIdMap, skipped, warnings, errors };
}

function parseParams(request: CodexRpcRequest): ImportParams | undefined {
  if (!isRecord(request.params)) return undefined;
  const params = request.params as Record<string, any>;
  if (!isRecord(params.workspace)) return undefined;
  const mode = params.mode ?? 'append';
  if (mode !== 'append' && mode !== 'replace') return undefined;
  if (params.expectedRevision !== undefined && typeof params.expectedRevision !== 'string') return undefined;
  if (params.confirm !== undefined && typeof params.confirm !== 'boolean') return undefined;
  if (params.dryRun !== undefined && typeof params.dryRun !== 'boolean') return undefined;
  return { workspace: params.workspace as PortableWorkspace, mode, expectedRevision: params.expectedRevision, confirm: params.confirm === true, dryRun: params.dryRun === true };
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try { return Boolean(new URL(value)); } catch { return false; }
}
function isColor(value: unknown): value is BrowserTabGroupColor { return ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'].includes(String(value)); }
function isWindowType(value: unknown): value is BrowserWindowType { return ['normal', 'popup', 'panel', 'app', 'devtools'].includes(String(value)); }
function toCreatableWindowType(value: BrowserWindowType): 'normal' | 'popup' | 'panel' { return value === 'popup' || value === 'panel' ? value : 'normal'; }
function toCreatableWindowState(value: PortableWindowWithGroups['state']): 'normal' | 'minimized' | 'maximized' | 'fullscreen' | undefined { return value === 'normal' || value === 'minimized' || value === 'maximized' || value === 'fullscreen' ? value : undefined; }
function countTabs(workspace: PortableWorkspace): number { return workspace.windows.reduce((count, window) => count + window.tabs.length, 0); }
function requestIdOf(request: unknown): string { return isRecord(request) && typeof request.requestId === 'string' ? request.requestId : 'unknown'; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Workspace import failed.'; }
function success<T>(request: CodexRpcRequest, result: T): CodexRpcResponse<T> { return { protocolVersion: CODEX_PROTOCOL_VERSION, requestId: request.requestId, result }; }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
