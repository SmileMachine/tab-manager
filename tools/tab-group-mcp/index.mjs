#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';

const PROTOCOL_VERSION = '1.0';
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SOCKET_DIRECTORY = process.env.TAB_GROUP_CODEX_SOCKET_DIRECTORY ?? '/tmp/tab-group-codex';
const SOCKET_PATH = process.env.TAB_GROUP_CODEX_SOCKET ?? path.join(SOCKET_DIRECTORY, `mcp-${process.pid}.sock`);
const AUTH_TOKEN = process.env.TAB_GROUP_CODEX_AUTH_TOKEN;
const TOOL_NAMES = [
  'tab_group.get_capabilities', 'tab_group.get_snapshot', 'tab_group.list_windows', 'tab_group.list_tabs', 'tab_group.list_groups',
  'tab_group.get_tab', 'tab_group.get_group', 'tab_group.get_window', 'tab_group.export_workspace', 'tab_group.get_events',
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
    candidate.on('data', (chunk) => {
      socketBuffer += chunk;
      readSocketLines();
    });
    candidate.on('error', (error) => log(`socket error: ${error.message}`));
    candidate.on('close', () => {
      if (socket !== candidate) return;
      socket = undefined;
      for (const [requestId, resolve] of pending) {
        resolve({ protocolVersion: PROTOCOL_VERSION, requestId, error: { code: 'transport-unavailable', message: 'The extension native host disconnected.' } });
      }
      pending.clear();
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

socketReady = new Promise((resolve, reject) => {
  socketResolve = resolve;
  socketReject = reject;
});

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
      const resolve = pending.get(requestId);
      if (resolve) {
        pending.delete(requestId);
        resolve(response);
      }
    } catch (error) {
      log(`Ignoring malformed socket JSON: ${error.message}`);
    }
  }
}

async function callExtension(method, params) {
  await socketReady;
  if (!socket) throw new Error('The extension native host is not connected.');
  const requestId = `mcp-${process.pid}-${nextRequestId++}`;
  const request = { protocolVersion: PROTOCOL_VERSION, requestId, method, ...(params === undefined ? {} : { params }) };
  const responsePromise = new Promise((resolve) => pending.set(requestId, resolve));
  log(`sending extension request ${requestId}`);
  socket.write(`${JSON.stringify({ protocolVersion: PROTOCOL_VERSION, kind: 'request', request, ...(AUTH_TOKEN === undefined ? {} : { authToken: AUTH_TOKEN }) })}\n`);
  return responsePromise;
}

function tools() {
  return TOOL_NAMES.map((name) => ({
    name,
    description: `Tab Group Manager tool ${name}. Read current state before mutating browser state.`,
    inputSchema: { type: 'object', additionalProperties: true }
  }));
}

async function handleRpc(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  if (message.method.startsWith('notifications/')) return;
  if (message.method === 'initialize') {
    writeJson({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'tab-group-mcp', version: '0.1.0' } } });
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
      const response = await callExtension(name, message.params?.arguments ?? {});
      const text = JSON.stringify(response);
      writeJson({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text }], structuredContent: response, isError: Boolean(response.error) } });
    } catch (error) {
      writeJson({ jsonrpc: '2.0', id: message.id, error: { code: -32001, message: error instanceof Error ? error.message : 'Extension request failed.' } });
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
