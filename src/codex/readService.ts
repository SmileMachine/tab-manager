import type { BrowserSnapshot, NativeGroupId, NativeWindowId } from '../domain/types';
import type { OperationJournal } from './operationJournal';
import type { TabContentInspector } from './tabContentInspector';
import {
  CODEX_PROTOCOL_VERSION,
  type BrowserSnapshotEnvelope,
  type CodexRpcError,
  type CodexRpcRequest,
  type CodexRpcResponse,
  type CodexToolName,
  type SnapshotFieldSet,
  createRpcError,
  isCodexRpcRequest
} from './protocol';
import { createSnapshotEnvelope, normalizeSnapshot, toPortableWorkspace } from './snapshot';

export const CODEX_BRIDGE_MESSAGE_TYPE = 'codex-tab-bridge-request';

const READ_METHODS = [
  'tab_group.get_capabilities',
  'tab_group.get_snapshot',
  'tab_group.list_windows',
  'tab_group.list_tabs',
  'tab_group.list_groups',
  'tab_group.get_tab',
  'tab_group.get_group',
  'tab_group.get_window',
  'tab_group.export_workspace'
] satisfies CodexToolName[];

const CONTENT_METHODS = [
  'tab_group.inspect_tabs',
  'tab_group.inspect_tab',
  'tab_group.read_tab_content'
] satisfies CodexToolName[];

export interface CodexReadBrowserApi {
  loadSnapshot(): Promise<BrowserSnapshot>;
}

export interface CodexRuntimeBridgeMessage {
  type: typeof CODEX_BRIDGE_MESSAGE_TYPE;
  request: unknown;
}

export interface CodexCapabilities {
  protocolVersion: typeof CODEX_PROTOCOL_VERSION;
  transport: 'extension-runtime';
  readMethods: CodexToolName[];
  writeMethods: CodexToolName[];
  fieldSets: SnapshotFieldSet[];
  historyMethods: CodexToolName[];
  contentMethods: CodexToolName[];
  limitations: string[];
}

export async function handleCodexReadRequest(
  request: unknown,
  api: CodexReadBrowserApi,
  journal?: OperationJournal,
  contentInspector?: TabContentInspector
): Promise<CodexRpcResponse<unknown>> {
  try {
    return await dispatchCodexReadRequest(request, api, journal, contentInspector);
  } catch (error) {
    const requestId = isRecord(request) && typeof request.requestId === 'string' ? request.requestId : 'unknown';
    return createRpcError(requestId, {
      code: 'operation-failed',
      message: error instanceof Error ? error.message : 'Unable to read browser state.'
    });
  }
}

async function dispatchCodexReadRequest(
  request: unknown,
  api: CodexReadBrowserApi,
  journal?: OperationJournal,
  contentInspector?: TabContentInspector
): Promise<CodexRpcResponse<unknown>> {
  if (!isCodexRpcRequest(request)) {
    return invalidRequest(request);
  }

  switch (request.method) {
    case 'tab_group.get_capabilities':
      return success(request, capabilities(Boolean(journal), Boolean(contentInspector)));
    case 'tab_group.get_snapshot': {
      const fieldSet = parseFieldSet(request.params);
      if (!fieldSet) {
        return invalidParams(request, 'fieldSet must be minimal, grouping, or full.');
      }
      return success(request, await loadEnvelope(api, fieldSet));
    }
    case 'tab_group.list_windows': {
      const fieldSet = parseFieldSet(request.params);
      if (!fieldSet) {
        return invalidParams(request, 'fieldSet must be minimal, grouping, or full.');
      }
      const envelope = await loadEnvelope(api, fieldSet);
      return success(request, {
        capturedAt: envelope.capturedAt,
        revision: envelope.revision,
        windows: envelope.snapshot.windows
      });
    }
    case 'tab_group.list_tabs': {
      const parsed = parseTabListParams(request.params);
      if (!parsed) {
        return invalidParams(request, 'Tab query contains an invalid field.');
      }
      const envelope = await loadEnvelope(api, parsed.fieldSet);
      return success(request, {
        capturedAt: envelope.capturedAt,
        revision: envelope.revision,
        tabs: envelope.snapshot.tabs.filter((tab) => matchesTabQuery(tab, parsed))
      });
    }
    case 'tab_group.list_groups': {
      const fieldSet = parseFieldSet(request.params);
      if (!fieldSet) {
        return invalidParams(request, 'fieldSet must be minimal, grouping, or full.');
      }
      const envelope = await loadEnvelope(api, fieldSet);
      return success(request, {
        capturedAt: envelope.capturedAt,
        revision: envelope.revision,
        groups: envelope.snapshot.groups
      });
    }
    case 'tab_group.get_tab': {
      const tabId = parseId(request.params, 'tabId');
      if (tabId === undefined) {
        return invalidParams(request, 'tabId must be a finite number.');
      }
      const fieldSet = parseFieldSet(request.params);
      if (!fieldSet) {
        return invalidParams(request, 'fieldSet must be minimal, grouping, or full.');
      }
      const envelope = await loadEnvelope(api, fieldSet);
      const tab = envelope.snapshot.tabs.find((candidate) => candidate.id === tabId);
      return tab ? success(request, { capturedAt: envelope.capturedAt, revision: envelope.revision, tab }) : notFound(request, 'tab', tabId);
    }
    case 'tab_group.get_group': {
      const groupId = parseId(request.params, 'groupId');
      if (groupId === undefined) {
        return invalidParams(request, 'groupId must be a finite number.');
      }
      const envelope = await loadEnvelope(api, 'grouping');
      const group = envelope.snapshot.groups.find((candidate) => candidate.id === groupId);
      return group
        ? success(request, {
            capturedAt: envelope.capturedAt,
            revision: envelope.revision,
            group,
            tabs: envelope.snapshot.tabs.filter((tab) => tab.groupId === groupId)
          })
        : notFound(request, 'group', groupId);
    }
    case 'tab_group.get_window': {
      const windowId = parseId(request.params, 'windowId');
      if (windowId === undefined) {
        return invalidParams(request, 'windowId must be a finite number.');
      }
      const envelope = await loadEnvelope(api, 'grouping');
      const window = envelope.snapshot.windows.find((candidate) => candidate.id === windowId);
      return window
        ? success(request, {
            capturedAt: envelope.capturedAt,
            revision: envelope.revision,
            window,
            groups: envelope.snapshot.groups.filter((group) => group.windowId === windowId),
            tabs: envelope.snapshot.tabs.filter((tab) => tab.windowId === windowId)
          })
        : notFound(request, 'window', windowId);
    }
    case 'tab_group.export_workspace': {
      const snapshot = normalizeSnapshot(await api.loadSnapshot());
      const envelope = createSnapshotEnvelope(snapshot, { fieldSet: 'full' });
      return success(request, {
        capturedAt: envelope.capturedAt,
        revision: envelope.revision,
        workspace: toPortableWorkspace(snapshot, envelope.capturedAt)
      });
    }
    case 'tab_group.inspect_tabs': {
      if (!contentInspector) return contentUnavailable(request);
      const parsed = parseBatchContentParams(request.params);
      if (!parsed) return invalidParams(request, 'tabIds must be a non-empty array of finite numbers.');
      return success(request, { outcomes: await contentInspector.inspectTabs(parsed.tabIds, parsed.options) });
    }
    case 'tab_group.inspect_tab':
    case 'tab_group.read_tab_content': {
      if (!contentInspector) return contentUnavailable(request);
      const parsed = parseSingleContentParams(request.params, request.method === 'tab_group.inspect_tab');
      if (!parsed) return invalidParams(request, 'tabId and content options are invalid.');
      return success(request, { outcome: await contentInspector.inspectTab(parsed.tabId, parsed.options) });
    }
    case 'tab_group.list_operation_history': {
      if (!journal) return journalUnavailable(request);
      return success(request, { operations: await journal.listOperations() });
    }
    case 'tab_group.get_operation': {
      if (!journal) return journalUnavailable(request);
      const operationId = parseString(request.params, 'operationId');
      if (!operationId) return invalidParams(request, 'operationId must be a non-empty string.');
      const operation = await journal.getOperation(operationId);
      if (!operation) return notFound(request, 'operation', operationId);
      const [beforeSnapshot, afterSnapshot] = await Promise.all([
        journal.getSnapshot(operation.beforeSnapshotId),
        operation.afterSnapshotId ? journal.getSnapshot(operation.afterSnapshotId) : undefined
      ]);
      return success(request, { operation, beforeSnapshot, afterSnapshot });
    }
    case 'tab_group.create_checkpoint': {
      if (!journal) return journalUnavailable(request);
      const name = parseString(request.params, 'name');
      if (!name) return invalidParams(request, 'name must be a non-empty string.');
      return success(request, { checkpoint: await journal.createCheckpoint(name, await api.loadSnapshot()) });
    }
    case 'tab_group.list_checkpoints': {
      if (!journal) return journalUnavailable(request);
      return success(request, { checkpoints: await journal.listCheckpoints() });
    }
    default:
      return createRpcError(request.requestId, {
        code: 'unknown-method',
        message: `Method ${request.method} is not available from the read bridge.`
      });
  }
}

export function isCodexRuntimeBridgeMessage(value: unknown): value is CodexRuntimeBridgeMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Partial<CodexRuntimeBridgeMessage>;
  return message.type === CODEX_BRIDGE_MESSAGE_TYPE;
}

function capabilities(operationHistoryAvailable: boolean, contentAvailable: boolean): CodexCapabilities {
  return {
    protocolVersion: CODEX_PROTOCOL_VERSION,
    transport: 'extension-runtime',
    readMethods: [...READ_METHODS],
    writeMethods: [],
    fieldSets: ['minimal', 'grouping', 'full'],
    historyMethods: operationHistoryAvailable
      ? ['tab_group.list_operation_history', 'tab_group.get_operation', 'tab_group.create_checkpoint', 'tab_group.list_checkpoints']
      : [],
    contentMethods: contentAvailable ? [...CONTENT_METHODS] : [],
    limitations: [
      'This phase supports extension-runtime read requests only.',
      'Native Messaging and write operations are not enabled yet.',
      'Browser tab and group identifiers are valid only for the current browser session.'
    ]
  };
}

async function loadEnvelope(api: CodexReadBrowserApi, fieldSet: SnapshotFieldSet): Promise<BrowserSnapshotEnvelope> {
  return createSnapshotEnvelope(await api.loadSnapshot(), { fieldSet });
}

function parseFieldSet(params: unknown): SnapshotFieldSet | undefined {
  if (params === undefined) {
    return 'grouping';
  }
  if (!isRecord(params)) {
    return undefined;
  }

  const value = params.fieldSet;
  return value === undefined || value === 'minimal' || value === 'grouping' || value === 'full' ? value ?? 'grouping' : undefined;
}

function parseTabListParams(params: unknown) {
  const fieldSet = parseFieldSet(params);
  if (!fieldSet || (params !== undefined && !isRecord(params))) {
    return undefined;
  }

  const record = (params ?? {}) as Record<string, unknown>;
  const numericKeys = ['windowId', 'groupId'] as const;
  for (const key of numericKeys) {
    if (record[key] !== undefined && !isFiniteNumber(record[key])) {
      return undefined;
    }
  }
  const stringKeys = ['text', 'hostname'] as const;
  for (const key of stringKeys) {
    if (record[key] !== undefined && typeof record[key] !== 'string') {
      return undefined;
    }
  }
  const booleanKeys = ['pinned', 'active', 'discarded'] as const;
  for (const key of booleanKeys) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      return undefined;
    }
  }

  return {
    fieldSet,
    windowId: record.windowId as NativeWindowId | undefined,
    groupId: record.groupId as NativeGroupId | undefined,
    text: record.text as string | undefined,
    hostname: record.hostname as string | undefined,
    pinned: record.pinned as boolean | undefined,
    active: record.active as boolean | undefined,
    discarded: record.discarded as boolean | undefined
  };
}

function matchesTabQuery(tab: BrowserSnapshot['tabs'][number], query: NonNullable<ReturnType<typeof parseTabListParams>>) {
  if (query.windowId !== undefined && tab.windowId !== query.windowId) return false;
  if (query.groupId !== undefined && tab.groupId !== query.groupId) return false;
  if (query.pinned !== undefined && tab.pinned !== query.pinned) return false;
  if (query.active !== undefined && tab.active !== query.active) return false;
  if (query.discarded !== undefined && (tab.discarded ?? false) !== query.discarded) return false;
  if (query.hostname !== undefined && tab.hostname !== query.hostname) return false;

  if (query.text) {
    const searchable = [tab.title, tab.url, tab.pendingUrl, tab.hostname].filter(Boolean).join('\n').toLocaleLowerCase();
    if (!searchable.includes(query.text.toLocaleLowerCase())) return false;
  }

  return true;
}

function parseBatchContentParams(params: unknown): { tabIds: number[]; options: { budget?: 'compact' | 'focused' | 'expanded'; maxChars?: number; maxSnippets?: number; focusTerms?: string[] } } | undefined {
  if (!isRecord(params) || !Array.isArray(params.tabIds) || params.tabIds.length === 0) return undefined;
  if (!params.tabIds.every(isFiniteNumber)) return undefined;
  const options = parseContentOptions(params, false);
  return options ? { tabIds: params.tabIds, options } : undefined;
}

function parseSingleContentParams(params: unknown, outlineOnly: boolean): { tabId: number; options: { mode?: 'outline' | 'excerpt' | 'focused' | 'structured'; budget?: 'compact' | 'focused' | 'expanded'; maxChars?: number; maxSnippets?: number; focusTerms?: string[] } } | undefined {
  if (!isRecord(params) || !isFiniteNumber(params.tabId)) return undefined;
  const options = parseContentOptions(params, true);
  if (!options) return undefined;
  if (outlineOnly) options.mode = 'outline';
  return { tabId: params.tabId, options };
}

function parseContentOptions(params: Record<string, unknown>, allowMode: boolean) {
  const mode = params.mode;
  const budget = params.budget;
  const maxChars = params.maxChars;
  const maxSnippets = params.maxSnippets;
  const focusTerms = params.focusTerms;
  if (allowMode && mode !== undefined && !['outline', 'excerpt', 'focused', 'structured'].includes(String(mode))) return undefined;
  if (budget !== undefined && !['compact', 'focused', 'expanded'].includes(String(budget))) return undefined;
  if (maxChars !== undefined && (!isFiniteNumber(maxChars) || maxChars <= 0)) return undefined;
  if (maxSnippets !== undefined && (!isFiniteNumber(maxSnippets) || maxSnippets <= 0)) return undefined;
  if (focusTerms !== undefined && (!Array.isArray(focusTerms) || !focusTerms.every((term) => typeof term === 'string'))) return undefined;
  return {
    ...(allowMode && mode !== undefined ? { mode: mode as 'outline' | 'excerpt' | 'focused' | 'structured' } : {}),
    ...(budget !== undefined ? { budget: budget as 'compact' | 'focused' | 'expanded' } : {}),
    ...(maxChars !== undefined ? { maxChars } : {}),
    ...(maxSnippets !== undefined ? { maxSnippets } : {}),
    ...(focusTerms !== undefined ? { focusTerms: focusTerms as string[] } : {})
  };
}

function parseString(params: unknown, key: 'operationId' | 'name'): string | undefined {
  if (!isRecord(params) || typeof params[key] !== 'string') {
    return undefined;
  }

  const value = params[key].trim();
  return value || undefined;
}

function parseId(params: unknown, key: 'tabId' | 'groupId' | 'windowId'): number | undefined {
  if (!isRecord(params) || !isFiniteNumber(params[key])) {
    return undefined;
  }

  return params[key];
}

function success<T>(request: CodexRpcRequest, result: T): CodexRpcResponse<T> {
  return {
    protocolVersion: CODEX_PROTOCOL_VERSION,
    requestId: request.requestId,
    result
  };
}

function invalidRequest(value: unknown): CodexRpcError {
  const requestId = isRecord(value) && typeof value.requestId === 'string' ? value.requestId : 'unknown';
  return createRpcError(requestId, { code: 'invalid-request', message: 'Expected a versioned tab-group request.' });
}

function invalidParams(request: CodexRpcRequest, message: string): CodexRpcError {
  return createRpcError(request.requestId, { code: 'invalid-params', message });
}

function contentUnavailable(request: CodexRpcRequest): CodexRpcError {
  return createRpcError(request.requestId, {
    code: 'transport-unavailable',
    message: 'Page-content inspection is unavailable in this bridge context.'
  });
}

function journalUnavailable(request: CodexRpcRequest): CodexRpcError {
  return createRpcError(request.requestId, {
    code: 'transport-unavailable',
    message: 'Operation journal is unavailable in this bridge context.'
  });
}

function notFound(request: CodexRpcRequest, entity: 'tab' | 'group' | 'window' | 'operation', id: number | string): CodexRpcError {
  return createRpcError(request.requestId, { code: 'not-found', message: `No ${entity} exists for id ${id}.` });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
