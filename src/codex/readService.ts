import type { BrowserSnapshot, NativeGroupId, NativeWindowId } from '../domain/types';
import type { HistoryRetentionOptions, OperationJournal } from './operationJournal';
import type { TabContentInspector } from './tabContentInspector';
import type { BrowserEventCursor } from './eventCursor';
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
  'tab_group.get_tabs',
  'tab_group.get_groups',
  'tab_group.get_window',
  'tab_group.export_workspace',
  'tab_group.get_events'
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
  eventMethods: CodexToolName[];
  limitations: string[];
}

export async function handleCodexReadRequest(
  request: unknown,
  api: CodexReadBrowserApi,
  journal?: OperationJournal,
  contentInspector?: TabContentInspector,
  writeMethods: CodexToolName[] = [],
  eventCursor?: BrowserEventCursor
): Promise<CodexRpcResponse<unknown>> {
  try {
    return await dispatchCodexReadRequest(request, api, journal, contentInspector, writeMethods, eventCursor);
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
  contentInspector?: TabContentInspector,
  writeMethods: CodexToolName[] = [],
  eventCursor?: BrowserEventCursor
): Promise<CodexRpcResponse<unknown>> {
  if (!isCodexRpcRequest(request)) {
    return invalidRequest(request);
  }

  switch (request.method) {
    case 'tab_group.get_capabilities':
      return success(request, capabilities(Boolean(journal), Boolean(contentInspector), writeMethods, Boolean(eventCursor)));
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
      const matchedTabs = envelope.snapshot.tabs.filter((tab) => matchesTabQuery(tab, parsed));
      const tabs = parsed.includeNeighbors > 0
        ? tabsWithNeighbors(envelope.snapshot.tabs, matchedTabs, parsed.includeNeighbors)
        : matchedTabs;
      return success(request, {
        capturedAt: envelope.capturedAt,
        revision: envelope.revision,
        matchedCount: matchedTabs.length,
        returnedCount: tabs.length,
        tabs,
        ...(parsed.includeSegments ? { segments: buildTabSegments(envelope.snapshot.tabs, matchedTabs, parsed.includeNeighbors) } : {})
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
    case 'tab_group.get_tabs': {
      const parsed = parseBatchDetailParams(request.params, 'tabIds');
      if (!parsed) {
        return invalidParams(request, 'tabIds must be a non-empty array of finite numbers and fieldSet must be valid.');
      }
      const envelope = await loadEnvelope(api, parsed.fieldSet);
      const requestedIds = uniqueIds(parsed.ids);
      const requested = new Set(requestedIds);
      const tabs = envelope.snapshot.tabs.filter((tab) => requested.has(tab.id));
      const found = new Set(tabs.map((tab) => tab.id));
      return success(request, {
        capturedAt: envelope.capturedAt,
        revision: envelope.revision,
        tabs,
        missingTabIds: requestedIds.filter((tabId) => !found.has(tabId))
      });
    }
    case 'tab_group.get_groups': {
      const parsed = parseGroupBatchParams(request.params);
      if (!parsed) {
        return invalidParams(request, 'groupIds must be a non-empty array of finite numbers, fieldSet must be valid, and tabDetail must be none, summary, or full.');
      }
      const envelope = await loadEnvelope(api, parsed.fieldSet);
      const requestedIds = uniqueIds(parsed.ids);
      const requested = new Set(requestedIds);
      const groups = envelope.snapshot.groups
        .filter((group) => requested.has(group.id))
        .map((group) => ({
          group,
          ...(parsed.tabDetail === 'none' ? {} : {
            tabs: envelope.snapshot.tabs.filter((tab) => tab.groupId === group.id)
          })
        }));
      const found = new Set(groups.map(({ group }) => group.id));
      return success(request, {
        capturedAt: envelope.capturedAt,
        revision: envelope.revision,
        tabDetail: parsed.tabDetail,
        groups,
        missingGroupIds: requestedIds.filter((groupId) => !found.has(groupId))
      });
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
    case 'tab_group.get_events': {
      if (!eventCursor) return createRpcError(request.requestId, { code: 'transport-unavailable', message: 'Browser event cursor is unavailable.' });
      const parsed = parseEventParams(request.params);
      if (!parsed) return invalidParams(request, 'after must be a non-negative integer and limit must be between 1 and 100.');
      return success(request, eventCursor.read(parsed.after, parsed.limit));
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
    case 'tab_group.prune_history': {
      if (!journal) return journalUnavailable(request);
      const parsed = parseHistoryPruneParams(request.params);
      if (!parsed) return invalidParams(request, 'History retention limits and confirm are invalid.');
      if (!parsed.confirm) return createRpcError(request.requestId, { code: 'confirmation-required', message: 'Pruning operation history requires confirm: true.' });
      return success(request, await journal.pruneHistory(parsed.options));
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
      const name = parseOptionalString(request.params, 'name');
      if (name === null) return invalidParams(request, 'name must be a string when provided.');
      const checkpoint = await journal.createCheckpoint(name, await api.loadSnapshot());
      return success(request, { checkpoint, generated: checkpoint.generated === true });
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

function capabilities(operationHistoryAvailable: boolean, contentAvailable: boolean, writeMethods: CodexToolName[], eventsAvailable: boolean): CodexCapabilities {
  return {
    protocolVersion: CODEX_PROTOCOL_VERSION,
    transport: 'extension-runtime',
    readMethods: [...READ_METHODS],
    writeMethods: [...writeMethods],
    fieldSets: ['minimal', 'grouping', 'full'],
    historyMethods: operationHistoryAvailable
      ? ['tab_group.list_operation_history', 'tab_group.get_operation', 'tab_group.create_checkpoint', 'tab_group.list_checkpoints', 'tab_group.prune_history']
      : [],
    contentMethods: contentAvailable ? [...CONTENT_METHODS] : [],
    eventMethods: eventsAvailable ? ['tab_group.get_events'] : [],
    limitations: [
      'This phase supports extension-runtime read requests only.',
      'Native Messaging is not enabled yet.',
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
  const numericArrayKeys = ['windowIds', 'groupIds'] as const;
  for (const key of numericArrayKeys) {
    if (record[key] !== undefined && (!Array.isArray(record[key]) || record[key].length === 0 || !record[key].every(isFiniteNumber))) {
      return undefined;
    }
  }
  const stringKeys = ['text', 'hostname'] as const;
  for (const key of stringKeys) {
    if (record[key] !== undefined && typeof record[key] !== 'string') {
      return undefined;
    }
  }
  const stringArrayKeys = ['textAny', 'hostnameAny', 'urlPrefixAny'] as const;
  for (const key of stringArrayKeys) {
    if (record[key] !== undefined && (!Array.isArray(record[key]) || record[key].length === 0 || !record[key].every((value) => typeof value === 'string' && value.length > 0))) {
      return undefined;
    }
  }
  const booleanKeys = ['pinned', 'active', 'discarded'] as const;
  for (const key of booleanKeys) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      return undefined;
    }
  }
  const includeNeighbors = record.includeNeighbors ?? 0;
  if (!isFiniteNumber(includeNeighbors) || !Number.isInteger(includeNeighbors) || includeNeighbors < 0 || includeNeighbors > 3) {
    return undefined;
  }
  if (record.includeSegments !== undefined && typeof record.includeSegments !== 'boolean') {
    return undefined;
  }

  return {
    fieldSet,
    windowId: record.windowId as NativeWindowId | undefined,
    windowIds: record.windowIds as NativeWindowId[] | undefined,
    groupId: record.groupId as NativeGroupId | undefined,
    groupIds: record.groupIds as NativeGroupId[] | undefined,
    text: record.text as string | undefined,
    textAny: record.textAny as string[] | undefined,
    hostname: record.hostname as string | undefined,
    hostnameAny: record.hostnameAny as string[] | undefined,
    urlPrefixAny: record.urlPrefixAny as string[] | undefined,
    pinned: record.pinned as boolean | undefined,
    active: record.active as boolean | undefined,
    discarded: record.discarded as boolean | undefined,
    includeNeighbors,
    includeSegments: record.includeSegments === true
  };
}

function parseBatchDetailParams(params: unknown, key: 'tabIds' | 'groupIds'):
  { ids: number[]; fieldSet: SnapshotFieldSet } | undefined {
  if (!isRecord(params) || !Array.isArray(params[key]) || params[key].length === 0 || !params[key].every(isFiniteNumber)) {
    return undefined;
  }
  const fieldSet = parseFieldSet(params);
  return fieldSet ? { ids: params[key] as number[], fieldSet } : undefined;
}

function parseGroupBatchParams(params: unknown):
  { ids: number[]; fieldSet: SnapshotFieldSet; tabDetail: 'none' | 'summary' | 'full' } | undefined {
  const parsed = parseBatchDetailParams(params, 'groupIds');
  if (!parsed || !isRecord(params)) return undefined;
  const tabDetail = params.tabDetail ?? 'summary';
  if (tabDetail !== 'none' && tabDetail !== 'summary' && tabDetail !== 'full') return undefined;
  return { ...parsed, tabDetail };
}

function uniqueIds(ids: number[]): number[] {
  return [...new Set(ids)];
}

function matchesTabQuery(tab: BrowserSnapshot['tabs'][number], query: NonNullable<ReturnType<typeof parseTabListParams>>) {
  if (query.windowId !== undefined && tab.windowId !== query.windowId) return false;
  if (query.windowIds !== undefined && !query.windowIds.includes(tab.windowId)) return false;
  if (query.groupId !== undefined && tab.groupId !== query.groupId) return false;
  if (query.groupIds !== undefined && !query.groupIds.includes(tab.groupId)) return false;
  if (query.pinned !== undefined && tab.pinned !== query.pinned) return false;
  if (query.active !== undefined && tab.active !== query.active) return false;
  if (query.discarded !== undefined && (tab.discarded ?? false) !== query.discarded) return false;
  if (query.hostname !== undefined && tab.hostname !== query.hostname) return false;
  if (query.hostnameAny !== undefined && !query.hostnameAny.includes(tab.hostname ?? '')) return false;
  if (query.urlPrefixAny !== undefined && !query.urlPrefixAny.some((prefix) => Boolean(tab.url?.startsWith(prefix) || tab.pendingUrl?.startsWith(prefix)))) return false;

  if (query.text) {
    const searchable = [tab.title, tab.url, tab.pendingUrl, tab.hostname].filter(Boolean).join('\n').toLocaleLowerCase();
    if (!searchable.includes(query.text.toLocaleLowerCase())) return false;
  }
  if (query.textAny !== undefined) {
    const searchable = [tab.title, tab.url, tab.pendingUrl, tab.hostname].filter(Boolean).join('\n').toLocaleLowerCase();
    if (!query.textAny.some((text) => searchable.includes(text.toLocaleLowerCase()))) return false;
  }

  return true;
}

function tabsWithNeighbors(allTabs: BrowserSnapshot['tabs'], matchedTabs: BrowserSnapshot['tabs'], radius: number) {
  const ranges = new Map<NativeWindowId, Array<{ start: number; end: number }>>();
  for (const tab of matchedTabs) {
    const windowTabs = allTabs.filter((candidate) => candidate.windowId === tab.windowId);
    const current = ranges.get(tab.windowId) ?? [];
    current.push({
      start: Math.max(0, tab.index - radius),
      end: Math.min(windowTabs.length - 1, tab.index + radius)
    });
    ranges.set(tab.windowId, current);
  }

  return allTabs.filter((tab) => ranges.get(tab.windowId)?.some((range) => tab.index >= range.start && tab.index <= range.end));
}

function buildTabSegments(allTabs: BrowserSnapshot['tabs'], matchedTabs: BrowserSnapshot['tabs'], radius: number) {
  const segments: Array<{ windowId: NativeWindowId; startIndex: number; endIndex: number; tabIds: number[]; matchedTabIds: number[] }> = [];
  const matchedByWindow = new Map<NativeWindowId, BrowserSnapshot['tabs']>();
  for (const tab of matchedTabs) {
    const current = matchedByWindow.get(tab.windowId) ?? [];
    current.push(tab);
    matchedByWindow.set(tab.windowId, current);
  }

  for (const [windowId, windowMatches] of matchedByWindow) {
    const windowTabs = allTabs.filter((tab) => tab.windowId === windowId);
    const ranges = windowMatches
      .sort((left, right) => left.index - right.index)
      .map((tab) => ({ start: Math.max(0, tab.index - radius), end: Math.min(windowTabs.length - 1, tab.index + radius) }))
      .reduce<Array<{ start: number; end: number }>>((merged, range) => {
        const previous = merged.at(-1);
        if (previous && range.start <= previous.end + 1) {
          previous.end = Math.max(previous.end, range.end);
        } else {
          merged.push({ ...range });
        }
        return merged;
      }, []);

    for (const range of ranges) {
      const tabs = windowTabs.filter((tab) => tab.index >= range.start && tab.index <= range.end);
      const matchedIds = new Set(windowMatches.map((tab) => tab.id));
      segments.push({
        windowId,
        startIndex: range.start,
        endIndex: range.end,
        tabIds: tabs.map((tab) => tab.id),
        matchedTabIds: tabs.filter((tab) => matchedIds.has(tab.id)).map((tab) => tab.id)
      });
    }
  }

  return segments.sort((left, right) => left.windowId - right.windowId || left.startIndex - right.startIndex);
}

function parseHistoryPruneParams(params: unknown): { options: HistoryRetentionOptions; confirm: boolean } | undefined {
  if (!isRecord(params)) return undefined;
  const confirm = params.confirm;
  if (confirm !== true && confirm !== false && confirm !== undefined) return undefined;
  const options: HistoryRetentionOptions = {};
  for (const key of ['maxOperations', 'maxCheckpoints', 'maxSnapshots'] as const) {
    const value = params[key];
    if (value !== undefined && (!isFiniteNumber(value) || !Number.isInteger(value) || value < 0)) return undefined;
    if (value !== undefined) options[key] = value;
  }
  return { options, confirm: confirm === true };
}

function parseEventParams(params: unknown): { after: number; limit: number } | undefined {
  if (params !== undefined && !isRecord(params)) return undefined;
  const record = (params ?? {}) as Record<string, unknown>;
  const after = record.after ?? 0;
  const limit = record.limit ?? 50;
  if (!isFiniteNumber(after) || !Number.isInteger(after) || after < 0) return undefined;
  if (!isFiniteNumber(limit) || !Number.isInteger(limit) || limit < 1 || limit > 100) return undefined;
  return { after, limit };
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

function parseOptionalString(params: unknown, key: 'name'): string | undefined | null {
  if (params === undefined) return undefined;
  if (!isRecord(params) || params[key] === undefined) return undefined;
  if (typeof params[key] !== 'string') return null;
  const value = params[key].trim();
  return value || null;
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
