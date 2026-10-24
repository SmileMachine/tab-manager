#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createDevelopmentControlHost } from './development-control.mjs';

const PROTOCOL_VERSION = '1.0';
const developmentControl = createDevelopmentControlHost({ origin: process.argv[2], send: writeNativeMessage });
const SOCKET_DIRECTORY = process.env.TAB_GROUP_CODEX_SOCKET_DIRECTORY ?? '/tmp/tab-group-codex';
const EXPLICIT_SOCKET_PATH = process.env.TAB_GROUP_CODEX_SOCKET;
const AUTH_TOKEN = process.env.TAB_GROUP_CODEX_AUTH_TOKEN;
const LOG_PATH = process.env.TAB_GROUP_CODEX_LOG ?? '/tmp/tab-group-native-host.log';
const STATUS_PATH = process.env.TAB_GROUP_CODEX_STATUS ?? '/tmp/tab-group-native-host-status.json';
const STARTED_AT = new Date().toISOString();
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const DISCOVERY_INTERVAL_MS = 250;
const MCP_REQUEST_TIMEOUT_MS = 15_000;

let nativeBuffer = Buffer.alloc(0);
let shuttingDown = false;
let discoveryTimer;
let nextPeerId = 1;
const peers = new Map();
const extensionRequests = new Map();
const mcpRequests = new Map();

function log(message) {
  const line = `[${new Date().toISOString()}] [tab-group-native-host] ${message}\n`;
  process.stderr.write(line);
  try { fs.appendFileSync(LOG_PATH, line); } catch { /* diagnostics must not break the bridge */ }
}

function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

function trackMcpRequest(requestId, peer) {
  const timer = setTimeout(() => {
    if (!mcpRequests.delete(requestId)) return;
    log(`Expired MCP request ${requestId} after ${MCP_REQUEST_TIMEOUT_MS}ms.`);
  }, MCP_REQUEST_TIMEOUT_MS);
  mcpRequests.set(requestId, { peer, timer });
}

function peerStatus(peer) {
  return {
    id: peer.id,
    socketPath: peer.socketPath,
    connected: peer.connected,
    connecting: peer.connecting,
    instance: peer.instance,
    connectedAt: peer.connectedAt,
    lastMessageAt: peer.lastMessageAt,
    lastRequestAt: peer.lastRequestAt,
    lastResponseAt: peer.lastResponseAt
  };
}

function writeStatus() {
  const status = {
    pid: process.pid,
    startedAt: STARTED_AT,
    updatedAt: new Date().toISOString(),
    socketDirectory: SOCKET_DIRECTORY,
    peers: [...peers.values()].map(peerStatus)
  };
  try {
    fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true, mode: 0o700 });
    fs.writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });
  } catch (error) {
    log(`Unable to write status: ${error.message}`);
  }
}

function removeStaleSocket(socketPath) {
  try {
    fs.unlinkSync(socketPath);
    log(`removed stale MCP socket ${socketPath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') log(`Unable to remove stale MCP socket ${socketPath}: ${error.message}`);
  }
}

function socketPaths() {
  if (EXPLICIT_SOCKET_PATH) return [EXPLICIT_SOCKET_PATH];
  try {
    return fs.readdirSync(SOCKET_DIRECTORY)
      .filter((name) => name.endsWith('.sock'))
      .map((name) => path.join(SOCKET_DIRECTORY, name));
  } catch (error) {
    if (error.code !== 'ENOENT') log(`Unable to scan socket directory: ${error.message}`);
    return [];
  }
}

function discoverPeers() {
  if (shuttingDown) return;
  const paths = new Set(socketPaths());
  for (const [socketPath, peer] of peers) {
    if (!paths.has(socketPath) && !peer.connected) {
      peer.socket.destroy();
      peers.delete(socketPath);
      writeStatus();
    }
  }
  for (const socketPath of paths) {
    const existing = peers.get(socketPath);
    if (!existing || (!existing.connected && !existing.connecting)) connectPeer(socketPath);
  }
}

function connectPeer(socketPath) {
  const existing = peers.get(socketPath);
  if (existing?.connecting || existing?.connected) return;
  const peer = { id: `peer-${nextPeerId++}`, socketPath, socket: net.createConnection(socketPath), buffer: '', connected: false, connecting: true, instance: undefined, connectedAt: undefined, lastMessageAt: undefined, lastRequestAt: undefined, lastResponseAt: undefined };
  peers.set(socketPath, peer);
  peer.socket.setEncoding('utf8');
  peer.socket.once('connect', () => {
    peer.connecting = false;
    peer.connected = true;
    peer.connectedAt = new Date().toISOString();
    log(`connected to MCP ${peer.id} at ${socketPath}`);
    writeStatus();
  });
  peer.socket.on('data', (chunk) => {
    peer.lastMessageAt = new Date().toISOString();
    peer.buffer += chunk;
    readSocketLines(peer);
  });
  peer.socket.on('error', (error) => {
    if (peer.connected) {
      log(`MCP ${peer.id} socket error: ${error.message}`);
      return;
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') removeStaleSocket(socketPath);
  });
  peer.socket.on('close', () => {
    peer.connected = false;
    peer.connecting = false;
    if (peers.get(socketPath) === peer) peers.delete(socketPath);
    writeStatus();
    for (const [requestId, request] of mcpRequests) {
      if (request.peer === peer) {
        mcpRequests.delete(requestId);
        clearTimeout(request.timer);
      }
    }
    for (const [requestId, requestPeer] of extensionRequests) {
      if (requestPeer === peer) {
        extensionRequests.delete(requestId);
        writeSocket(peer, createResponse(requestId, 'transport-unavailable', 'The local MCP server disconnected.'));
      }
    }
  });
}

function readSocketLines(peer) {
  while (true) {
    const newline = peer.buffer.indexOf('\n');
    if (newline < 0) return;
    const line = peer.buffer.slice(0, newline).trim();
    peer.buffer = peer.buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); }
    catch { log(`Ignoring malformed JSON from MCP ${peer.id}.`); continue; }
    if (message?.kind === 'hello') {
      if (message.protocolVersion !== PROTOCOL_VERSION || !isRecord(message.instance)) {
        log(`Ignoring malformed hello from MCP ${peer.id}.`);
        continue;
      }
      peer.instance = {
        pid: message.instance.pid,
        serverVersion: message.instance.serverVersion,
        startedAt: message.instance.startedAt,
        socketPath: message.instance.socketPath
      };
      log(`MCP ${peer.id} hello: pid=${peer.instance.pid}, socket=${peer.instance.socketPath}`);
      writeStatus();
      continue;
    }
    if (message?.kind === 'request') {
      const requestId = message.request?.requestId;
      if (typeof requestId !== 'string') {
        log(`Ignoring MCP request without requestId from ${peer.id}.`);
        continue;
      }
      peer.lastRequestAt = new Date().toISOString();
      trackMcpRequest(requestId, peer);
      writeNativeMessage(message);
      continue;
    }
    if (message?.kind === 'response') {
      const requestId = message.response?.requestId;
      const requestPeer = typeof requestId === 'string' ? extensionRequests.get(requestId) : undefined;
      if (requestPeer) {
        extensionRequests.delete(requestId);
        requestPeer.lastResponseAt = new Date().toISOString();
        writeNativeMessage(message);
        writeStatus();
      }
    }
  }
}

function availablePeer() {
  return [...peers.values()].find((peer) => peer.connected);
}

function writeSocket(peer, message) {
  if (!peer?.connected) return false;
  peer.lastMessageAt = new Date().toISOString();
  peer.socket.write(`${JSON.stringify(message)}\n`);
  return true;
}

function readNativeMessages() {
  while (nativeBuffer.length >= 4) {
    const messageLength = nativeBuffer.readUInt32LE(0);
    if (messageLength > MAX_MESSAGE_BYTES) {
      log(`Rejecting oversized Native Messaging message: ${messageLength} bytes.`);
      process.exitCode = 1;
      return;
    }
    if (nativeBuffer.length < messageLength + 4) return;
    const payload = nativeBuffer.subarray(4, messageLength + 4).toString('utf8');
    nativeBuffer = nativeBuffer.subarray(messageLength + 4);
    void handleNativeMessage(payload);
  }
}

async function handleNativeMessage(payload) {
  let raw;
  try { raw = JSON.parse(payload); } catch {}
  if (await developmentControl.handle(raw)) return;
  const message = parseNativeMessage(payload);
  if (!message) {
    writeNativeMessage(createResponse('unknown', 'invalid-request', 'The native message envelope is invalid.'));
    return;
  }
  if (message.kind === 'response') {
    const request = mcpRequests.get(message.response.requestId);
    if (!request) {
      log(`Ignoring response for unknown MCP request ${message.response.requestId}.`);
      return;
    }
    mcpRequests.delete(message.response.requestId);
    clearTimeout(request.timer);
    request.peer.lastResponseAt = new Date().toISOString();
    writeSocket(request.peer, message);
    writeStatus();
    return;
  }

  const requestId = String(message.request.requestId);
  const peer = availablePeer();
  if (!peer) {
    writeNativeMessage(createResponse(requestId, 'transport-unavailable', 'No local MCP server is connected.'));
    return;
  }
  if (AUTH_TOKEN !== undefined) message.authToken = AUTH_TOKEN;
  peer.lastRequestAt = new Date().toISOString();
  extensionRequests.set(requestId, peer);
  writeStatus();
  if (!writeSocket(peer, message)) {
    extensionRequests.delete(requestId);
    writeNativeMessage(createResponse(requestId, 'transport-unavailable', 'The local MCP server is unavailable.'));
  }
}

function parseNativeMessage(payload) {
  try {
    const value = JSON.parse(payload);
    if (value?.protocolVersion !== PROTOCOL_VERSION || (value?.kind !== 'request' && value?.kind !== 'response')) return undefined;
    if (value.kind === 'request' && (value.request?.protocolVersion !== PROTOCOL_VERSION || typeof value.request.requestId !== 'string' || typeof value.request.method !== 'string')) return undefined;
    if (value.kind === 'response' && (value.response?.protocolVersion !== PROTOCOL_VERSION || typeof value.response.requestId !== 'string')) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function createResponse(requestId, code, message) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    kind: 'response',
    response: { protocolVersion: PROTOCOL_VERSION, requestId, error: { code, message } }
  };
}

function writeNativeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

log(`starting; socket directory: ${SOCKET_DIRECTORY}; argv: ${JSON.stringify(process.argv.slice(2))}`);
writeStatus();
discoverPeers();
discoveryTimer = setInterval(discoverPeers, DISCOVERY_INTERVAL_MS);
process.stdin.on('data', (chunk) => {
  nativeBuffer = Buffer.concat([nativeBuffer, chunk]);
  readNativeMessages();
});
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(discoveryTimer);
  void developmentControl.close();
  for (const peer of peers.values()) peer.socket.destroy();
  peers.clear();
  for (const request of mcpRequests.values()) clearTimeout(request.timer);
  mcpRequests.clear();
  try {
    const status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
    if (status.pid === process.pid) fs.unlinkSync(STATUS_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') log(`Unable to remove status: ${error.message}`);
  }
}
process.stdin.on('end', shutdown);
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
