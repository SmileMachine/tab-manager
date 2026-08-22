#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';

const PROTOCOL_VERSION = '1.0';
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_VERSION = '0.1.0';
const DEFAULT_TOOL_TIMEOUT_MS = 15_000;
const TOOL_TIMEOUT_MS = readToolTimeout();
const MAX_UNIX_SOCKET_PATH_BYTES = process.platform === 'darwin' ? 104 : 108;
const STARTED_AT = new Date().toISOString();
const SOCKET_DIRECTORY = process.env.TAB_GROUP_CODEX_SOCKET_DIRECTORY ?? '/tmp/tab-group-codex';
const SOCKET_PATH = process.env.TAB_GROUP_CODEX_SOCKET ?? path.join(SOCKET_DIRECTORY, `mcp-${process.pid}.sock`);
const AUTH_TOKEN = process.env.TAB_GROUP_CODEX_AUTH_TOKEN;
const TOOL_NAMES = [
  'tab_group.get_capabilities', 'tab_group.get_snapshot', 'tab_group.get_workspace_overview', 'tab_group.get_snapshot_delta', 'tab_group.list_windows', 'tab_group.list_tabs', 'tab_group.list_groups',
  'tab_group.get_tabs', 'tab_group.get_groups', 'tab_group.get_window', 'tab_group.export_workspace', 'tab_group.get_events',
  'tab_group.prune_history', 'tab_group.inspect_tabs', 'tab_group.inspect_tab', 'tab_group.read_tab_content', 'tab_group.activate_tab',
  'tab_group.create_tabs', 'tab_group.update_tab', 'tab_group.move_tabs', 'tab_group.reorder_tabs', 'tab_group.close_tabs',
  'tab_group.discard_tabs', 'tab_group.ungroup_tabs', 'tab_group.create_group', 'tab_group.update_group', 'tab_group.move_tabs_to_group',
  'tab_group.move_group', 'tab_group.ungroup_group', 'tab_group.preview_operations', 'tab_group.apply_operations', 'tab_group.preview_import',
  'tab_group.import_workspace', 'tab_group.list_operation_history', 'tab_group.get_operation', 'tab_group.create_checkpoint',
  'tab_group.list_checkpoints', 'tab_group.preview_rollback', 'tab_group.rollback_operation'
];

let socket;
let socketBuffer = '';
let socketReady;
let socketResolve;
let socketReject;
let nextRequestId = 1;
const pending = new Map();
let capabilitiesCache;

function readToolTimeout() {
  const value = Number.parseInt(process.env.TAB_GROUP_CODEX_TOOL_TIMEOUT_MS ?? '', 10);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TOOL_TIMEOUT_MS;
  return Math.min(value, DEFAULT_TOOL_TIMEOUT_MS);
}

class ExtensionRequestTimeoutError extends Error {
  code = 'transport-unavailable';
  timeoutMs = TOOL_TIMEOUT_MS;

  constructor() {
    super(`The extension did not respond within ${TOOL_TIMEOUT_MS}ms.`);
    this.name = 'ExtensionRequestTimeoutError';
  }
}

function log(message) {
  process.stderr.write(`[tab-group-mcp ${process.pid}] ${message}\n`);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function removeSocket() {
  try {
    fs.unlinkSync(SOCKET_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function setupSocket() {
  if (Buffer.byteLength(SOCKET_PATH) >= MAX_UNIX_SOCKET_PATH_BYTES) {
    throw new Error(`The MCP socket path is too long (${Buffer.byteLength(SOCKET_PATH)} bytes; maximum ${MAX_UNIX_SOCKET_PATH_BYTES - 1}): ${SOCKET_PATH}`);
  }
  fs.mkdirSync(path.dirname(SOCKET_PATH), { recursive: true, mode: 0o700 });
  removeSocket();
  const server = net.createServer((candidate) => {
    if (socket) {
      candidate.destroy();
      return;
    }
    socket = candidate;
    log(`native host connected at ${SOCKET_PATH}`);
    candidate.setEncoding('utf8');
    candidate.write(`${JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      kind: 'hello',
      instance: {
        pid: process.pid,
        serverVersion: SERVER_VERSION,
        startedAt: STARTED_AT,
        socketPath: SOCKET_PATH
      }
    })}\n`);
    candidate.on('data', (chunk) => {
      socketBuffer += chunk;
      readSocketLines();
    });
    candidate.on('error', (error) => log(`socket error: ${error.message}`));
    candidate.on('close', () => {
      if (socket !== candidate) return;
      socket = undefined;
      for (const [requestId, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve({ protocolVersion: PROTOCOL_VERSION, requestId, error: { code: 'transport-unavailable', message: 'The extension native host disconnected.' } });
      }
      pending.clear();
      capabilitiesCache = undefined;
      resetSocketReady();
    });
    socketResolve?.(candidate);
  });
  server.listen(SOCKET_PATH, () => {
    try { fs.chmodSync(SOCKET_PATH, 0o600); } catch (error) { log(`Unable to set socket permissions: ${error.message}`); }
    log(`listening at ${SOCKET_PATH}`);
  });
  server.on('error', (error) => {
    socketReject?.(error);
    log(`server error: ${error.message}`);
  });
  return server;
}

function resetSocketReady() {
  socketReady = new Promise((resolve, reject) => {
    socketResolve = resolve;
    socketReject = reject;
  });
}

resetSocketReady();

function settlePending(requestId, response) {
  const entry = pending.get(requestId);
  if (!entry) return false;
  pending.delete(requestId);
  clearTimeout(entry.timer);
  entry.resolve(response);
  return true;
}

function readSocketLines() {
  while (true) {
    const newline = socketBuffer.indexOf('\n');
    if (newline < 0) return;
    const line = socketBuffer.slice(0, newline).trim();
    socketBuffer = socketBuffer.slice(newline + 1);
    if (!line) continue;
    try {
      const message = JSON.parse(line);
      const response = message.response ?? message;
      const requestId = String(response.requestId ?? message.requestId ?? '');
      settlePending(requestId, response);
    } catch (error) {
      log(`Ignoring malformed socket JSON: ${error.message}`);
    }
  }
}

async function callExtension(method, params) {
  const requestId = `mcp-${process.pid}-${nextRequestId++}`;
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.delete(requestId)) return;
      reject(new ExtensionRequestTimeoutError());
    }, TOOL_TIMEOUT_MS);
    pending.set(requestId, { resolve, timer });
    void socketReady.then(() => {
      if (!pending.has(requestId)) return;
      const candidate = socket;
      if (!candidate) {
        settlePending(requestId, { protocolVersion: PROTOCOL_VERSION, requestId, error: { code: 'transport-unavailable', message: 'The extension native host is not connected.' } });
        return;
      }
      const request = { protocolVersion: PROTOCOL_VERSION, requestId, method, ...(params === undefined ? {} : { params }) };
      log(`sending extension request ${requestId}`);
      candidate.write(`${JSON.stringify({ protocolVersion: PROTOCOL_VERSION, kind: 'request', request, ...(AUTH_TOKEN === undefined ? {} : { authToken: AUTH_TOKEN }) })}\n`, (error) => {
        if (error) settlePending(requestId, { protocolVersion: PROTOCOL_VERSION, requestId, error: { code: 'transport-unavailable', message: error.message } });
      });
    }).catch((error) => {
      settlePending(requestId, { protocolVersion: PROTOCOL_VERSION, requestId, error: { code: 'transport-unavailable', message: error instanceof Error ? error.message : 'Unable to connect to the extension native host.' } });
    });
  });
  return response;
}

const EMPTY_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };
const FIELD_SET_SCHEMA = { type: 'string', enum: ['minimal', 'grouping', 'full'] };
const ID_SCHEMA = { type: 'number' };
const ID_ARRAY_SCHEMA = { type: 'array', minItems: 1, items: ID_SCHEMA };
const STRING_ARRAY_SCHEMA = { type: 'array', minItems: 1, items: { type: 'string' } };
const CONTENT_OPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['outline', 'excerpt', 'focused', 'structured'] },
    budget: { type: 'string', enum: ['compact', 'focused', 'expanded'] },
    maxChars: { type: 'number', exclusiveMinimum: 0 },
    maxSnippets: { type: 'number', exclusiveMinimum: 0 },
    focusTerms: STRING_ARRAY_SCHEMA
  },
  additionalProperties: false
};
const SNAPSHOT_SCHEMA = {
  type: 'object',
  properties: { fieldSet: FIELD_SET_SCHEMA },
  additionalProperties: false
};
const TAB_LIST_SCHEMA = {
  type: 'object',
  properties: {
    windowId: ID_SCHEMA,
    windowIds: ID_ARRAY_SCHEMA,
    groupId: ID_SCHEMA,
    groupIds: ID_ARRAY_SCHEMA,
    text: { type: 'string' },
    textAny: STRING_ARRAY_SCHEMA,
    hostname: { type: 'string' },
    hostnameAny: STRING_ARRAY_SCHEMA,
    urlPrefixAny: STRING_ARRAY_SCHEMA,
    pinned: { type: 'boolean' },
    active: { type: 'boolean' },
    discarded: { type: 'boolean' },
    includeNeighbors: { type: 'number', minimum: 0, maximum: 3 },
    includeSegments: { type: 'boolean' },
    fieldSet: FIELD_SET_SCHEMA
  },
  additionalProperties: false
};
const BATCH_TAB_SCHEMA = {
  type: 'object',
  required: ['tabIds'],
  properties: { tabIds: ID_ARRAY_SCHEMA, fieldSet: FIELD_SET_SCHEMA },
  additionalProperties: false
};
const BATCH_GROUP_SCHEMA = {
  type: 'object',
  required: ['groupIds'],
  properties: { groupIds: ID_ARRAY_SCHEMA, fieldSet: FIELD_SET_SCHEMA, tabDetail: { type: 'string', enum: ['none', 'summary', 'full'] } },
  additionalProperties: false
};
const WRITE_COMMON_SCHEMA = {
  expectedRevision: { type: 'string' },
  confirm: { type: 'boolean' },
  dryRun: { type: 'boolean' },
  failurePolicy: { type: 'string', enum: ['stop', 'continue'] },
  returnState: { type: 'string', enum: ['none', 'affected', 'grouping', 'full'] },
  previewId: { type: 'string', minLength: 1 },
  idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 }
};
const OPERATION_SCHEMA = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: { type: 'string' },
    tabId: ID_SCHEMA,
    tabIds: ID_ARRAY_SCHEMA,
    windowId: ID_SCHEMA,
    windowIds: ID_ARRAY_SCHEMA,
    targetWindowId: ID_SCHEMA,
    targetIndex: { type: 'number' },
    targetGroupId: ID_SCHEMA,
    groupId: ID_SCHEMA,
    title: { type: 'string' },
    color: { type: 'string' },
    changes: { type: 'object' },
    tabs: { type: 'array', minItems: 1, items: { type: 'object' } }
  },
  additionalProperties: true
};
const OPERATIONS_SCHEMA = { type: 'array', minItems: 1, items: OPERATION_SCHEMA };
const APPLY_SCHEMA = {
  type: 'object',
  properties: { ...WRITE_COMMON_SCHEMA, operations: OPERATIONS_SCHEMA },
  additionalProperties: false
};
const PREVIEW_SCHEMA = {
  type: 'object',
  required: ['operations'],
  properties: { ...WRITE_COMMON_SCHEMA, operations: OPERATIONS_SCHEMA },
  additionalProperties: false
};
const TAB_IDS_WRITE_SCHEMA = {
  type: 'object',
  required: ['tabIds'],
  properties: { ...WRITE_COMMON_SCHEMA, tabIds: ID_ARRAY_SCHEMA },
  additionalProperties: false
};
const MOVE_TABS_SCHEMA = {
  type: 'object',
  required: ['tabIds', 'targetWindowId', 'targetIndex'],
  properties: { ...WRITE_COMMON_SCHEMA, tabIds: ID_ARRAY_SCHEMA, targetWindowId: ID_SCHEMA, targetIndex: { type: 'number' } },
  additionalProperties: false
};
const TOOL_SCHEMAS = {
  'tab_group.get_capabilities': EMPTY_SCHEMA,
  'tab_group.get_snapshot': SNAPSHOT_SCHEMA,
  'tab_group.get_workspace_overview': EMPTY_SCHEMA,
  'tab_group.get_snapshot_delta': { type: 'object', required: ['sinceRevision'], properties: { sinceRevision: { type: 'string', minLength: 1 }, fieldSet: FIELD_SET_SCHEMA }, additionalProperties: false },
  'tab_group.list_windows': SNAPSHOT_SCHEMA,
  'tab_group.list_tabs': TAB_LIST_SCHEMA,
  'tab_group.list_groups': SNAPSHOT_SCHEMA,
  'tab_group.get_tabs': BATCH_TAB_SCHEMA,
  'tab_group.get_groups': BATCH_GROUP_SCHEMA,
  'tab_group.get_window': { type: 'object', required: ['windowId'], properties: { windowId: ID_SCHEMA }, additionalProperties: false },
  'tab_group.export_workspace': EMPTY_SCHEMA,
  'tab_group.get_events': { type: 'object', properties: { after: { type: 'number', minimum: 0 }, limit: { type: 'number', minimum: 1, maximum: 100 } }, additionalProperties: false },
  'tab_group.prune_history': { type: 'object', properties: { maxOperations: { type: 'number', minimum: 0 }, maxCheckpoints: { type: 'number', minimum: 0 }, maxSnapshots: { type: 'number', minimum: 0 }, confirm: { type: 'boolean' } }, additionalProperties: false },
  'tab_group.inspect_tabs': { type: 'object', required: ['tabIds'], properties: { tabIds: ID_ARRAY_SCHEMA, ...CONTENT_OPTIONS_SCHEMA.properties }, additionalProperties: false },
  'tab_group.inspect_tab': { type: 'object', required: ['tabId'], properties: { tabId: ID_SCHEMA, ...CONTENT_OPTIONS_SCHEMA.properties }, additionalProperties: false },
  'tab_group.read_tab_content': { type: 'object', required: ['tabId'], properties: { tabId: ID_SCHEMA, ...CONTENT_OPTIONS_SCHEMA.properties }, additionalProperties: false },
  'tab_group.activate_tab': { type: 'object', required: ['tabId', 'windowId'], properties: { ...WRITE_COMMON_SCHEMA, tabId: ID_SCHEMA, windowId: ID_SCHEMA }, additionalProperties: false },
  'tab_group.create_tabs': { type: 'object', required: ['tabs'], properties: { ...WRITE_COMMON_SCHEMA, tabs: { type: 'array', minItems: 1, items: { type: 'object' } } }, additionalProperties: false },
  'tab_group.update_tab': { type: 'object', required: ['tabId', 'changes'], properties: { ...WRITE_COMMON_SCHEMA, tabId: ID_SCHEMA, changes: { type: 'object' } }, additionalProperties: false },
  'tab_group.move_tabs': MOVE_TABS_SCHEMA,
  'tab_group.reorder_tabs': MOVE_TABS_SCHEMA,
  'tab_group.close_tabs': TAB_IDS_WRITE_SCHEMA,
  'tab_group.discard_tabs': TAB_IDS_WRITE_SCHEMA,
  'tab_group.ungroup_tabs': TAB_IDS_WRITE_SCHEMA,
  'tab_group.create_group': { type: 'object', required: ['tabIds', 'windowId'], properties: { ...WRITE_COMMON_SCHEMA, tabIds: ID_ARRAY_SCHEMA, windowId: ID_SCHEMA, title: { type: 'string' }, color: { type: 'string' } }, additionalProperties: false },
  'tab_group.update_group': { type: 'object', required: ['groupId', 'changes'], properties: { ...WRITE_COMMON_SCHEMA, groupId: ID_SCHEMA, changes: { type: 'object' } }, additionalProperties: false },
  'tab_group.move_tabs_to_group': { type: 'object', required: ['tabIds', 'targetGroupId', 'targetWindowId'], properties: { ...WRITE_COMMON_SCHEMA, tabIds: ID_ARRAY_SCHEMA, targetGroupId: ID_SCHEMA, targetWindowId: ID_SCHEMA }, additionalProperties: false },
  'tab_group.move_group': { type: 'object', required: ['groupId', 'targetWindowId', 'targetIndex'], properties: { ...WRITE_COMMON_SCHEMA, groupId: ID_SCHEMA, targetWindowId: ID_SCHEMA, targetIndex: { type: 'number' } }, additionalProperties: false },
  'tab_group.ungroup_group': { type: 'object', required: ['groupId'], properties: { ...WRITE_COMMON_SCHEMA, groupId: ID_SCHEMA }, additionalProperties: false },
  'tab_group.preview_operations': PREVIEW_SCHEMA,
  'tab_group.apply_operations': APPLY_SCHEMA,
  'tab_group.preview_import': { type: 'object', required: ['workspace'], properties: { workspace: { type: 'object' }, mode: { type: 'string', enum: ['append', 'replace'] }, expectedRevision: { type: 'string' }, dryRun: { type: 'boolean' }, confirm: { type: 'boolean' } }, additionalProperties: false },
  'tab_group.import_workspace': { type: 'object', required: ['workspace'], properties: { workspace: { type: 'object' }, mode: { type: 'string', enum: ['append', 'replace'] }, expectedRevision: { type: 'string' }, dryRun: { type: 'boolean' }, confirm: { type: 'boolean' } }, additionalProperties: false },
  'tab_group.list_operation_history': EMPTY_SCHEMA,
  'tab_group.get_operation': { type: 'object', required: ['operationId'], properties: { operationId: { type: 'string', minLength: 1 } }, additionalProperties: false },
  'tab_group.create_checkpoint': { type: 'object', properties: { name: { type: 'string', minLength: 1 } }, additionalProperties: false },
  'tab_group.list_checkpoints': EMPTY_SCHEMA,
  'tab_group.preview_rollback': { type: 'object', properties: { operationId: { type: 'string' }, checkpointId: { type: 'string' }, snapshotId: { type: 'string' }, expectedRevision: { type: 'string' }, closeExtraTabs: { type: 'boolean' }, dryRun: { type: 'boolean' }, confirm: { type: 'boolean' } }, additionalProperties: false },
  'tab_group.rollback_operation': { type: 'object', properties: { operationId: { type: 'string' }, checkpointId: { type: 'string' }, snapshotId: { type: 'string' }, expectedRevision: { type: 'string' }, closeExtraTabs: { type: 'boolean' }, dryRun: { type: 'boolean' }, confirm: { type: 'boolean' } }, additionalProperties: false }
};

function tools() {
  return TOOL_NAMES.map((name) => ({
    name,
    description: `Tab Group Manager tool ${name}. Read current state before mutating browser state.`,
    inputSchema: TOOL_SCHEMAS[name] ?? EMPTY_SCHEMA
  }));
}

function summarizeResponse(name, response) {
  if (response?.error) return `${name} failed: ${response.error.code ?? 'error'}: ${response.error.message ?? 'Request failed.'}`;
  const result = response?.result;
  if (!result || typeof result !== 'object') return `${name} succeeded.`;
  const keys = Object.keys(result).slice(0, 8).join(', ');
  return `${name} succeeded${keys ? `; fields: ${keys}` : ''}. Full structured output is available in structuredContent.`;
}

async function handleRpc(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  if (message.method.startsWith('notifications/')) return;
  if (message.method === 'initialize') {
    writeJson({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'tab-group-mcp', version: SERVER_VERSION } } });
    return;
  }
  if (message.method === 'ping') {
    writeJson({ jsonrpc: '2.0', id: message.id, result: {} });
    return;
  }
  if (message.method === 'tools/list') {
    writeJson({ jsonrpc: '2.0', id: message.id, result: { tools: tools() } });
    return;
  }
  if (message.method === 'tools/call') {
    const name = message.params?.name;
    if (!TOOL_NAMES.includes(name)) {
      writeJson({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: `Unknown tool: ${name}` } });
      return;
    }
    try {
      const response = name === 'tab_group.get_capabilities' && capabilitiesCache
        ? capabilitiesCache
        : await callExtension(name, message.params?.arguments ?? {});
      if (name === 'tab_group.get_capabilities' && !response.error) capabilitiesCache = response;
      writeJson({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: summarizeResponse(name, response) }],
          structuredContent: response,
          isError: Boolean(response.error)
        }
      });
    } catch (error) {
      writeJson({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32001,
          message: error instanceof Error ? error.message : 'Extension request failed.',
          data: error instanceof ExtensionRequestTimeoutError
            ? { code: error.code, timeoutMs: error.timeoutMs, retryable: true }
            : undefined
        }
      });
    }
    return;
  }
  writeJson({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
}

const server = setupSocket();
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  input.close();
  socket?.destroy();
  server.close();
  removeSocket();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
for await (const line of input) {
  if (!line.trim()) continue;
  try { await handleRpc(JSON.parse(line)); }
  catch (error) { log(`Invalid MCP request: ${error.message}`); }
}
shutdown();
