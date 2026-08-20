import type { BrowserSnapshot, NativeGroupId, NativeTabId, NativeWindowId } from '../domain/types';
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
  limitations: string[];
}

export async function handleCodexReadRequest(
  request: unknown,
  api: CodexReadBrowserApi
): Promise<CodexRpcResponse<unknown>> {
  try {
    return await dispatchCodexReadRequest(request, api);
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
  api: CodexReadBrowserApi
): Promise<CodexRpcResponse<unknown>> {
  if (!isCodexRpcRequest(request)) {
    return invalidRequest(request);
  }

  switch (request.method) {
    case 'tab_group.get_capabilities':
      return success(request, capabilities());
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

function capabilities(): CodexCapabilities {
  return {
    protocolVersion: CODEX_PROTOCOL_VERSION,
    transport: 'extension-runtime',
    readMethods: [...READ_METHODS],
    writeMethods: [],
    fieldSets: ['minimal', 'grouping', 'full'],
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

function notFound(request: CodexRpcRequest, entity: 'tab' | 'group' | 'window', id: number): CodexRpcError {
  return createRpcError(request.requestId, { code: 'not-found', message: `No ${entity} exists for id ${id}.` });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
