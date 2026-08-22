import type {
  BrowserSnapshot,
  BrowserTabGroupColor,
  NativeGroupId,
  NativeTabId,
  NativeWindowId
} from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { createSnapshotEnvelope } from './snapshot';
import type { OperationJournal } from './operationJournal';
import {
  CODEX_PROTOCOL_VERSION,
  type CodexRpcError,
  type CodexRpcRequest,
  type CodexRpcResponse,
  type CodexToolName,
  type JsonValue,
  type OperationReturnState,
  createRpcError,
  isCodexRpcRequest
} from './protocol';

export const CODEX_WRITE_METHODS = [
  'tab_group.activate_tab',
  'tab_group.create_tabs',
  'tab_group.update_tab',
  'tab_group.move_tabs',
  'tab_group.reorder_tabs',
  'tab_group.close_tabs',
  'tab_group.discard_tabs',
  'tab_group.ungroup_tabs',
  'tab_group.create_group',
  'tab_group.update_group',
  'tab_group.move_tabs_to_group',
  'tab_group.move_group',
  'tab_group.ungroup_group',
  'tab_group.preview_operations',
  'tab_group.apply_operations'
] satisfies CodexToolName[];

export interface TabGroupOperationBase {
  kind: string;
}

export type TabGroupOperation =
  | (TabGroupOperationBase & { kind: 'activateTab'; tabId: NativeTabId; windowId: NativeWindowId })
  | (TabGroupOperationBase & {
      kind: 'createTabs';
      tabs: Array<{ windowId?: NativeWindowId; index?: number; url?: string; pinned?: boolean; active?: boolean }>;
    })
  | (TabGroupOperationBase & {
      kind: 'updateTab';
      tabId: NativeTabId;
      changes: { url?: string; pinned?: boolean; muted?: boolean; autoDiscardable?: boolean };
    })
  | (TabGroupOperationBase & { kind: 'moveTabs'; tabIds: NativeTabId[]; targetWindowId: NativeWindowId; targetIndex: number })
  | (TabGroupOperationBase & { kind: 'closeTabs'; tabIds: NativeTabId[] })
  | (TabGroupOperationBase & { kind: 'discardTabs'; tabIds: NativeTabId[] })
  | (TabGroupOperationBase & { kind: 'ungroupTabs'; tabIds: NativeTabId[] })
  | (TabGroupOperationBase & {
      kind: 'createGroup';
      tabIds: NativeTabId[];
      windowId: NativeWindowId;
      title?: string;
      color?: BrowserTabGroupColor;
    })
  | (TabGroupOperationBase & {
      kind: 'updateGroup';
      groupId: NativeGroupId;
      changes: { title?: string; color?: BrowserTabGroupColor; collapsed?: boolean };
    })
  | (TabGroupOperationBase & { kind: 'moveTabsToGroup'; tabIds: NativeTabId[]; targetGroupId: NativeGroupId; targetWindowId: NativeWindowId })
  | (TabGroupOperationBase & { kind: 'moveGroup'; groupId: NativeGroupId; targetWindowId: NativeWindowId; targetIndex: number })
  | (TabGroupOperationBase & { kind: 'ungroupGroup'; groupId: NativeGroupId });

export interface OperationPreviewItem {
  index: number;
  kind: string;
  valid: boolean;
  message?: string;
  affectedTabIds: NativeTabId[];
  affectedGroupIds: NativeGroupId[];
  requiresConfirmation: boolean;
}

export interface OperationPreview {
  valid: boolean;
  requiresConfirmation: boolean;
  warnings: string[];
  items: OperationPreviewItem[];
  revision: string;
  previewId?: string;
  expiresAt?: string;
  operationHash?: string;
  plannedRevision?: string;
}

export interface OperationBatchResult {
  operationId?: string;
  status: 'dry-run' | 'succeeded' | 'partially-failed' | 'failed';
  revision: string;
  preview: OperationPreview;
  results: Array<{ index: number; kind: string; status: 'succeeded' | 'failed'; message?: string; result?: unknown }>;
  state: OperationState;
}

export interface OperationState {
  mode: OperationReturnState;
  revision: string;
  affectedTabIds?: NativeTabId[];
  affectedGroupIds?: NativeGroupId[];
  affectedWindowIds?: NativeWindowId[];
  snapshot?: ReturnType<typeof createSnapshotEnvelope>;
}

export interface CodexWriteServices {
  api: BrowserTabsApi;
  journal: OperationJournal;
}

interface PreviewPlan {
  previewId: string;
  expiresAt: number;
  operationHash: string;
  plannedRevision: string;
  operations: TabGroupOperation[];
}

const PREVIEW_TTL_MS = 30_000;
const previewPlans = new Map<string, PreviewPlan>();

export function isCodexWriteMethod(value: unknown): value is CodexToolName {
  return typeof value === 'string' && (CODEX_WRITE_METHODS as readonly string[]).includes(value);
}

export async function handleCodexWriteRequest(
  request: unknown,
  services: CodexWriteServices
): Promise<CodexRpcResponse<unknown>> {
  if (!isCodexRpcRequest(request) || !isCodexWriteMethod(request.method)) {
    return createRpcError(isRecord(request) && typeof request.requestId === 'string' ? request.requestId : 'unknown', {
      code: 'unknown-method',
      message: 'The requested write method is not available.'
    });
  }

  try {
    const parsed = parseWriteRequest(request);
    if (!parsed) return invalidParams(request, 'Write request parameters are invalid.');

    if (request.method === 'tab_group.preview_operations') {
      const snapshot = await services.api.loadSnapshot();
      const envelope = createSnapshotEnvelope(snapshot, { fieldSet: 'full' });
      if (parsed.expectedRevision && parsed.expectedRevision !== envelope.revision) {
        return createRpcError(request.requestId, {
          code: 'stale-state',
          message: 'The browser state changed before the operation preview was created.',
          details: { currentRevision: envelope.revision }
        });
      }
      const preview = await previewOperations(snapshot, parsed.operations!, services.api);
      if (!preview.valid) return success(request, preview);
      const plan = createPreviewPlan(parsed.operations!, preview);
      return success(request, {
        ...preview,
        previewId: plan.previewId,
        expiresAt: new Date(plan.expiresAt).toISOString(),
        operationHash: plan.operationHash,
        plannedRevision: plan.plannedRevision
      });
    }

    let previewPlan: PreviewPlan | undefined;
    if (request.method === 'tab_group.apply_operations' && parsed.previewId) {
      previewPlan = getPreviewPlan(parsed.previewId);
      if (!previewPlan) {
        return createRpcError(request.requestId, {
          code: 'stale-preview',
          message: 'The preview plan does not exist or has expired.',
          details: { previewId: parsed.previewId }
        });
      }
      if (parsed.operations && operationHash(parsed.operations) !== previewPlan.operationHash) {
        return createRpcError(request.requestId, {
          code: 'stale-preview',
          message: 'The operations do not match the selected preview plan.',
          details: { previewId: parsed.previewId }
        });
      }
    }

    const operations = request.method === 'tab_group.apply_operations'
      ? parsed.operations ?? previewPlan?.operations
      : [singleMethodToOperation(request.method, isRecord(request.params) ? request.params : {})];
    if (!operations?.[0]) return invalidParams(request, 'The write method has no executable operation.');
    if (request.method === 'tab_group.apply_operations' && parsed.idempotencyKey) {
      const existing = await services.journal.getOperationByIdempotencyKey(parsed.idempotencyKey);
      if (existing) {
        const fingerprint = requestFingerprint(operations, { ...parsed, previewPlan });
        const existingFingerprint = isRecord(existing.requestSummary) && typeof existing.requestSummary.requestFingerprint === 'string'
          ? existing.requestSummary.requestFingerprint
          : undefined;
        if (existingFingerprint !== fingerprint) {
          return invalidParams(request, 'idempotencyKey is already associated with a different operation request.');
        }
        if (existing.result !== undefined) return success(request, existing.result);
        return success(request, { operationId: existing.operationId, status: 'in-progress', idempotencyKey: parsed.idempotencyKey });
      }
    }
    const result = await applyOperations(request, services, operations, { ...parsed, previewPlan });
    return isRpcError(result) ? result : success(request, result);
  } catch (error) {
    return createRpcError(request.requestId, {
      code: 'operation-failed',
      message: error instanceof Error ? error.message : 'Unable to apply browser operation.'
    });
  }
}

async function applyOperations(
  request: CodexRpcRequest,
  services: CodexWriteServices,
  operations: TabGroupOperation[],
  params: ParsedWriteParams
): Promise<OperationBatchResult | CodexRpcError> {
  const before = await services.api.loadSnapshot();
  const beforeEnvelope = createSnapshotEnvelope(before, { fieldSet: 'full' });
  const expectedRevision = params.expectedRevision ?? params.previewPlan?.plannedRevision;
  if (params.previewPlan && params.previewPlan.expiresAt <= Date.now()) {
    previewPlans.delete(params.previewPlan.previewId);
    return createRpcError(request.requestId, {
      code: 'stale-preview',
      message: 'The preview plan has expired.',
      details: { previewId: params.previewPlan.previewId }
    });
  }
  if (params.previewPlan && operationHash(operations) !== params.previewPlan.operationHash) {
    return createRpcError(request.requestId, {
      code: 'stale-preview',
      message: 'The operations do not match the selected preview plan.',
      details: { previewId: params.previewPlan.previewId }
    });
  }
  if (expectedRevision && expectedRevision !== beforeEnvelope.revision) {
    return createRpcError(request.requestId, {
      code: 'stale-state',
      message: 'The browser state changed after the snapshot used to plan this operation.',
      details: { currentRevision: beforeEnvelope.revision }
    });
  }

  const rawPreview = await previewOperations(before, operations, services.api);
  if (!rawPreview.valid) {
    return createRpcError(request.requestId, {
      code: 'invalid-params',
      message: 'One or more browser operations cannot be applied.',
      details: rawPreview as unknown as JsonValue
    });
  }
  const preview = params.previewPlan
    ? {
        ...rawPreview,
        previewId: params.previewPlan.previewId,
        expiresAt: new Date(params.previewPlan.expiresAt).toISOString(),
        operationHash: params.previewPlan.operationHash,
        plannedRevision: params.previewPlan.plannedRevision
      }
    : rawPreview;
  if (preview.requiresConfirmation && !params.confirm) {
    return createRpcError(request.requestId, {
      code: 'confirmation-required',
      message: 'This operation changes or closes tabs and requires confirm: true.',
      details: preview as unknown as JsonValue
    });
  }
  if (params.dryRun) {
    return {
      operationId: undefined,
      status: 'dry-run',
      revision: beforeEnvelope.revision,
      preview,
      results: [],
      state: buildOperationState(before, preview, params.returnState)
    };
  }

  const record = await services.journal.begin({
    source: 'codex',
    operationType: 'applyOperations',
    beforeSnapshot: before,
    expectedRevision,
    idempotencyKey: params.idempotencyKey,
    requestSummary: {
      operations: operations.map((operation) => operation.kind),
      operationHash: operationHash(operations),
      requestFingerprint: requestFingerprint(operations, params)
    }
  });
  const results: OperationBatchResult['results'] = [];
  const errors: string[] = [];

  for (const [index, operation] of operations.entries()) {
    try {
      const result = await executeOperation(services.api, operation);
      results.push({ index, kind: operation.kind, status: 'succeeded', result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browser operation failed.';
      results.push({ index, kind: operation.kind, status: 'failed', message });
      errors.push(message);
      if (params.failurePolicy !== 'continue') break;
    }
  }

  const after = await services.api.loadSnapshot();
  const afterEnvelope = createSnapshotEnvelope(after, { fieldSet: 'full' });
  const status = errors.length === 0 ? 'succeeded' : results.some((result) => result.status === 'succeeded') ? 'partially-failed' : 'failed';
  const batchResult: OperationBatchResult = {
    operationId: record.operationId,
    status,
    revision: afterEnvelope.revision,
    preview,
    results,
    state: buildOperationState(after, preview, params.returnState)
  };
  await services.journal.complete(record, {
    afterSnapshot: after,
    status,
    errors,
    result: batchResult as unknown as JsonValue
  });

  return batchResult;
}

function createPreviewPlan(operations: TabGroupOperation[], preview: OperationPreview): PreviewPlan {
  prunePreviewPlans();
  const previewId = `preview-${crypto.randomUUID()}`;
  const expiresAt = Date.now() + PREVIEW_TTL_MS;
  const plan: PreviewPlan = {
    previewId,
    expiresAt,
    operationHash: operationHash(operations),
    plannedRevision: preview.revision,
    operations: structuredClone(operations)
  };
  previewPlans.set(previewId, plan);
  return plan;
}

function getPreviewPlan(previewId: string): PreviewPlan | undefined {
  prunePreviewPlans();
  return previewPlans.get(previewId);
}

function prunePreviewPlans() {
  const now = Date.now();
  for (const [previewId, plan] of previewPlans) {
    if (plan.expiresAt <= now) previewPlans.delete(previewId);
  }
}

function operationHash(operations: TabGroupOperation[]): string {
  return `fnv1a64:${fnv1a64(stableStringify(operations))}`;
}

function requestFingerprint(operations: TabGroupOperation[], params: ParsedWriteParams): string {
  return `fnv1a64:${fnv1a64(stableStringify({
    operations,
    expectedRevision: params.expectedRevision ?? params.previewPlan?.plannedRevision,
    confirm: params.confirm,
    dryRun: params.dryRun,
    failurePolicy: params.failurePolicy,
    returnState: params.returnState
  }))}`;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

async function previewOperations(snapshot: BrowserSnapshot, operations: TabGroupOperation[], api: BrowserTabsApi): Promise<OperationPreview> {
  const tabIds = new Set(snapshot.tabs.map((tab) => tab.id));
  const groupIds = new Set(snapshot.groups.map((group) => group.id));
  const windowIds = new Set(snapshot.windows.map((window) => window.id));
  const items: OperationPreviewItem[] = operations.map((operation, index) => validateOperation(operation, index, snapshot, tabIds, groupIds, windowIds, api));

  return {
    valid: items.every((item) => item.valid),
    requiresConfirmation: items.some((item) => item.requiresConfirmation),
    warnings: items.filter((item) => item.message && item.valid).map((item) => item.message!),
    items,
    revision: createSnapshotEnvelope(snapshot, { fieldSet: 'full' }).revision
  };
}

function buildOperationState(snapshot: BrowserSnapshot, preview: OperationPreview, mode: OperationReturnState): OperationState {
  const revision = createSnapshotEnvelope(snapshot, { fieldSet: 'full' }).revision;
  if (mode === 'none') {
    return { mode, revision };
  }

  if (mode === 'grouping' || mode === 'full') {
    return {
      mode,
      revision,
      snapshot: createSnapshotEnvelope(snapshot, { fieldSet: mode })
    };
  }

  const affectedTabIds = uniqueNumericIds(preview.items.flatMap((item) => item.affectedTabIds));
  const affectedGroupIds = uniqueNumericIds(preview.items.flatMap((item) => item.affectedGroupIds));
  const tabIdSet = new Set(affectedTabIds);
  const groupIdSet = new Set(affectedGroupIds);
  const envelope = createSnapshotEnvelope(snapshot, { fieldSet: 'grouping' });
  const tabs = envelope.snapshot.tabs.filter((tab) => tabIdSet.has(tab.id));
  const groups = envelope.snapshot.groups.filter((group) => groupIdSet.has(group.id));
  const windowIdSet = new Set<NativeWindowId>([
    ...tabs.map((tab) => tab.windowId),
    ...groups.map((group) => group.windowId)
  ]);

  return {
    mode,
    revision,
    affectedTabIds,
    affectedGroupIds,
    affectedWindowIds: [...windowIdSet].sort((left, right) => left - right),
    snapshot: {
      ...envelope,
      snapshot: {
        ...envelope.snapshot,
        windows: envelope.snapshot.windows.filter((window) => windowIdSet.has(window.id)),
        tabs,
        groups
      }
    }
  };
}

function uniqueNumericIds(ids: number[]) {
  return [...new Set(ids)].sort((left, right) => left - right);
}

function validateOperation(
  operation: TabGroupOperation,
  index: number,
  snapshot: BrowserSnapshot,
  tabIds: Set<number>,
  groupIds: Set<number>,
  windowIds: Set<number>,
  api: BrowserTabsApi
): OperationPreviewItem {
  const affectedTabIds = 'tabIds' in operation ? [...operation.tabIds] : 'tabId' in operation ? [operation.tabId] : [];
  const affectedGroupIds = 'groupId' in operation ? [operation.groupId] : 'targetGroupId' in operation ? [operation.targetGroupId] : [];
  const base = { index, kind: operation.kind, affectedTabIds, affectedGroupIds, requiresConfirmation: false };
  const invalid = (message: string): OperationPreviewItem => ({ ...base, valid: false, message });
  const valid = (message?: string, requiresConfirmation = false): OperationPreviewItem => ({ ...base, valid: true, message, requiresConfirmation });

  if (operation.kind === 'createTabs') {
    if (!api.createTabs) return invalid('The browser adapter does not support createTabs.');
    if (operation.tabs.length === 0) return invalid('createTabs requires at least one tab.');
    if (operation.tabs.some((tab) => tab.windowId !== undefined && !windowIds.has(tab.windowId))) return invalid('createTabs references a missing window.');
    return valid();
  }
  if (operation.kind === 'updateTab') {
    if (!tabIds.has(operation.tabId)) return invalid(`Tab ${operation.tabId} does not exist.`);
    if (!api.updateTab) return invalid('The browser adapter does not support updateTab.');
    return valid();
  }
  if (operation.kind === 'moveTabs') {
    if (!api.moveTabs) return invalid('The browser adapter does not support moveTabs.');
    if (!allExist(operation.tabIds, tabIds)) return invalid('moveTabs references a missing tab.');
    if (!windowIds.has(operation.targetWindowId) || !Number.isFinite(operation.targetIndex)) return invalid('moveTabs has an invalid destination.');
    return valid();
  }
  if (operation.kind === 'activateTab') {
    return tabIds.has(operation.tabId) && windowIds.has(operation.windowId) ? valid() : invalid('activateTab references a missing tab or window.');
  }
  if (operation.kind === 'closeTabs') {
    return allExist(operation.tabIds, tabIds) ? valid('Closing tabs is destructive.', true) : invalid('closeTabs references a missing tab.');
  }
  if (operation.kind === 'discardTabs') {
    return allExist(operation.tabIds, tabIds) ? valid() : invalid('discardTabs references a missing tab.');
  }
  if (operation.kind === 'ungroupTabs') {
    return allExist(operation.tabIds, tabIds) ? valid() : invalid('ungroupTabs references a missing tab.');
  }
  if (operation.kind === 'createGroup') {
    if (!allExist(operation.tabIds, tabIds)) return invalid('createGroup references a missing tab.');
    const selectedTabs = snapshot.tabs.filter((tab) => operation.tabIds.includes(tab.id));
    return selectedTabs.length > 0 && selectedTabs.every((tab) => tab.windowId === operation.windowId)
      ? valid()
      : invalid('A native group can only contain tabs from one window.');
  }
  if (operation.kind === 'updateGroup') {
    return groupIds.has(operation.groupId) ? valid() : invalid(`Group ${operation.groupId} does not exist.`);
  }
  if (operation.kind === 'moveTabsToGroup') {
    const group = snapshot.groups.find((candidate) => candidate.id === operation.targetGroupId);
    if (!groupIds.has(operation.targetGroupId) || !group) return invalid('moveTabsToGroup references a missing group.');
    if (!allExist(operation.tabIds, tabIds)) return invalid('moveTabsToGroup references a missing tab.');
    return group.windowId === operation.targetWindowId ? valid() : invalid('The target window must own the target group.');
  }
  if (operation.kind === 'moveGroup') {
    if (!groupIds.has(operation.groupId) || !windowIds.has(operation.targetWindowId) || !Number.isFinite(operation.targetIndex)) {
      return invalid('moveGroup references a missing group, window, or index.');
    }
    return valid();
  }
  if (operation.kind === 'ungroupGroup') {
    return groupIds.has(operation.groupId) ? valid() : invalid(`Group ${operation.groupId} does not exist.`);
  }

  return invalid('Unknown operation.');
}

async function executeOperation(api: BrowserTabsApi, operation: TabGroupOperation): Promise<unknown> {
  switch (operation.kind) {
    case 'activateTab':
      return api.activateTab(operation.tabId, operation.windowId);
    case 'createTabs':
      return requireMethod(api.createTabs, 'createTabs')(operation.tabs);
    case 'updateTab':
      return requireMethod(api.updateTab, 'updateTab')(operation.tabId, operation.changes);
    case 'moveTabs':
      return requireMethod(api.moveTabs, 'moveTabs')(operation.tabIds, operation.targetWindowId, operation.targetIndex);
    case 'closeTabs':
      return api.closeTabs(operation.tabIds);
    case 'discardTabs':
      return api.discardTabs(operation.tabIds);
    case 'ungroupTabs':
      return api.ungroupTabs(operation.tabIds);
    case 'createGroup':
      return api.createGroup(operation.tabIds, operation.windowId, operation.title ?? '', operation.color ?? 'grey');
    case 'updateGroup':
      return api.updateGroup(operation.groupId, operation.changes);
    case 'moveTabsToGroup':
      return api.moveTabsToGroup(operation.tabIds, operation.targetGroupId, operation.targetWindowId);
    case 'moveGroup':
      return api.moveGroup(operation.groupId, operation.targetWindowId, operation.targetIndex);
    case 'ungroupGroup': {
      const snapshot = await api.loadSnapshot();
      const tabIds = snapshot.tabs.filter((tab) => tab.groupId === operation.groupId).map((tab) => tab.id);
      return api.ungroupTabs(tabIds);
    }
  }
}

interface ParsedWriteParams {
  operations?: TabGroupOperation[];
  expectedRevision?: string;
  confirm: boolean;
  dryRun: boolean;
  failurePolicy: 'stop' | 'continue';
  returnState: OperationReturnState;
  previewId?: string;
  previewPlan?: PreviewPlan;
  idempotencyKey?: string;
}

function parseWriteRequest(request: CodexRpcRequest): ParsedWriteParams | undefined {
  if (!isRecord(request.params)) return undefined;
  const params = request.params;
  const isPreview = request.method === 'tab_group.preview_operations';
  const isApply = request.method === 'tab_group.apply_operations';
  const operations = isPreview || isApply
    ? parseOperations(params.operations)
    : parseOperations([singleMethodToOperation(request.method, params)]);
  const previewId = params.previewId;
  if (previewId !== undefined && (typeof previewId !== 'string' || previewId.trim().length === 0)) return undefined;
  const idempotencyKey = params.idempotencyKey;
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0 || idempotencyKey.length > 200)) return undefined;
  if (!operations && !(isApply && previewId !== undefined)) return undefined;
  if (params.expectedRevision !== undefined && typeof params.expectedRevision !== 'string') return undefined;
  if (params.confirm !== undefined && typeof params.confirm !== 'boolean') return undefined;
  if (params.dryRun !== undefined && typeof params.dryRun !== 'boolean') return undefined;
  if (params.failurePolicy !== undefined && params.failurePolicy !== 'stop' && params.failurePolicy !== 'continue') return undefined;
  if (params.returnState !== undefined && !['none', 'affected', 'grouping', 'full'].includes(String(params.returnState))) return undefined;
  return {
    operations: operations as TabGroupOperation[] | undefined,
    expectedRevision: params.expectedRevision as string | undefined,
    confirm: params.confirm === true,
    dryRun: params.dryRun === true,
    failurePolicy: params.failurePolicy === 'continue' ? 'continue' : 'stop',
    returnState: (params.returnState ?? 'affected') as OperationReturnState,
    previewId: previewId as string | undefined,
    idempotencyKey: idempotencyKey as string | undefined
  };
}

function parseOperations(value: unknown): TabGroupOperation[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const operations: TabGroupOperation[] = [];

  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.kind !== 'string' || !isOperationShape(candidate)) return undefined;
    operations.push(candidate as unknown as TabGroupOperation);
  }

  return operations;
}

function isOperationShape(operation: Record<string, unknown>): boolean {
  const tabIds = operation.tabIds;
  const hasTabIds = Array.isArray(tabIds) && tabIds.length > 0 && tabIds.every(isFiniteNumber);
  const hasTabId = isFiniteNumber(operation.tabId);
  const hasGroupId = isFiniteNumber(operation.groupId);
  const hasTargetGroupId = isFiniteNumber(operation.targetGroupId);
  const hasWindowId = isFiniteNumber(operation.windowId);
  const hasTargetWindowId = isFiniteNumber(operation.targetWindowId);
  const hasTargetIndex = isFiniteNumber(operation.targetIndex);

  switch (operation.kind) {
    case 'activateTab':
      return hasTabId && hasWindowId;
    case 'createTabs':
      return Array.isArray(operation.tabs) && operation.tabs.length > 0 && operation.tabs.every((tab) => {
        if (!isRecord(tab)) return false;
        if (tab.windowId !== undefined && !isFiniteNumber(tab.windowId)) return false;
        if (tab.index !== undefined && !isFiniteNumber(tab.index)) return false;
        if (tab.url !== undefined && typeof tab.url !== 'string') return false;
        return ['pinned', 'active'].every((key) => tab[key] === undefined || typeof tab[key] === 'boolean');
      });
    case 'updateTab':
      return hasTabId && isRecord(operation.changes);
    case 'moveTabs':
      return hasTabIds && hasTargetWindowId && hasTargetIndex;
    case 'closeTabs':
    case 'discardTabs':
    case 'ungroupTabs':
      return hasTabIds;
    case 'createGroup':
      return hasTabIds && hasWindowId;
    case 'updateGroup':
      return hasGroupId && isRecord(operation.changes);
    case 'moveTabsToGroup':
      return hasTabIds && hasTargetGroupId && hasTargetWindowId;
    case 'moveGroup':
      return hasGroupId && hasTargetWindowId && hasTargetIndex;
    case 'ungroupGroup':
      return hasGroupId;
    default:
      return false;
  }
}

function singleMethodToOperation(method: CodexToolName, params: Record<string, unknown>): TabGroupOperation {
  const mapping: Record<string, string> = {
    'tab_group.activate_tab': 'activateTab',
    'tab_group.create_tabs': 'createTabs',
    'tab_group.update_tab': 'updateTab',
    'tab_group.move_tabs': 'moveTabs',
    'tab_group.reorder_tabs': 'moveTabs',
    'tab_group.close_tabs': 'closeTabs',
    'tab_group.discard_tabs': 'discardTabs',
    'tab_group.ungroup_tabs': 'ungroupTabs',
    'tab_group.create_group': 'createGroup',
    'tab_group.update_group': 'updateGroup',
    'tab_group.move_tabs_to_group': 'moveTabsToGroup',
    'tab_group.move_group': 'moveGroup',
    'tab_group.ungroup_group': 'ungroupGroup'
  };
  const kind = mapping[method];
  if (!kind) throw new Error(`Method ${method} does not map to a browser operation.`);
  const { kind: _ignored, ...operation } = params;
  return { kind, ...operation } as unknown as TabGroupOperation;
}

function allExist(values: number[], existing: Set<number>): boolean {
  return values.length > 0 && values.every((value) => existing.has(value));
}

function requireMethod<T extends (...args: never[]) => unknown>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`The browser adapter does not support ${name}.`);
  return method;
}

function isRpcError(value: unknown): value is CodexRpcError {
  return value !== null && typeof value === 'object' && 'error' in value;
}

function success<T>(request: CodexRpcRequest, result: T): CodexRpcResponse<T> {
  return { protocolVersion: CODEX_PROTOCOL_VERSION, requestId: request.requestId, result };
}

function invalidParams(request: CodexRpcRequest, message: string): CodexRpcError {
  return createRpcError(request.requestId, { code: 'invalid-params', message });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
