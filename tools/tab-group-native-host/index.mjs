#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const PROTOCOL_VERSION = '1.0';
const SOCKET_DIRECTORY = process.env.TAB_GROUP_CODEX_SOCKET_DIRECTORY ?? '/tmp/tab-group-codex';
const EXPLICIT_SOCKET_PATH = process.env.TAB_GROUP_CODEX_SOCKET;
const AUTH_TOKEN = process.env.TAB_GROUP_CODEX_AUTH_TOKEN;
const LOG_PATH = process.env.TAB_GROUP_CODEX_LOG ?? '/tmp/tab-group-native-host.log';
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const DISCOVERY_INTERVAL_MS = 250;

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
  const peer = { id: `peer-${nextPeerId++}`, socketPath, socket: net.createConnection(socketPath), buffer: '', connected: false, connecting: true };
  peers.set(socketPath, peer);
  peer.socket.setEncoding('utf8');
  peer.socket.once('connect', () => {
    peer.connecting = false;
    peer.connected = true;
    log(`connected to MCP ${peer.id} at ${socketPath}`);
  });
  peer.socket.on('data', (chunk) => {
    peer.buffer += chunk;
    readSocketLines(peer);
  });
  peer.socket.on('error', (error) => {
    if (peer.connected) log(`MCP ${peer.id} socket error: ${error.message}`);
  });
  peer.socket.on('close', () => {
    peer.connected = false;
    peer.connecting = false;
    if (peers.get(socketPath) === peer) peers.delete(socketPath);
    for (const [requestId, requestPeer] of mcpRequests) {
      if (requestPeer === peer) {
        mcpRequests.delete(requestId);
        writeNativeMessage(createResponse(requestId, 'transport-unavailable', 'The local MCP server disconnected.'));
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
    if (message?.kind === 'request') {
      const requestId = message.request?.requestId;
      if (typeof requestId !== 'string') {
        log(`Ignoring MCP request without requestId from ${peer.id}.`);
        continue;
      }
      mcpRequests.set(requestId, peer);
      writeNativeMessage(message);
      continue;
    }
    if (message?.kind === 'response') {
      const requestId = message.response?.requestId;
      const requestPeer = typeof requestId === 'string' ? extensionRequests.get(requestId) : undefined;
      if (requestPeer) {
        extensionRequests.delete(requestId);
        writeNativeMessage(message);
      }
    }
  }
}

function availablePeer() {
  return [...peers.values()].find((peer) => peer.connected);
}

function writeSocket(peer, message) {
  if (!peer?.connected) return false;
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
  const message = parseNativeMessage(payload);
  if (!message) {
    writeNativeMessage(createResponse('unknown', 'invalid-request', 'The native message envelope is invalid.'));
    return;
  }
  if (message.kind === 'response') {
    const peer = mcpRequests.get(message.response.requestId);
    if (!peer) {
      log(`Ignoring response for unknown MCP request ${message.response.requestId}.`);
      return;
    }
    mcpRequests.delete(message.response.requestId);
    writeSocket(peer, message);
    return;
  }

  const requestId = String(message.request.requestId);
  const peer = availablePeer();
  if (!peer) {
    writeNativeMessage(createResponse(requestId, 'transport-unavailable', 'No local MCP server is connected.'));
    return;
  }
  if (AUTH_TOKEN !== undefined) message.authToken = AUTH_TOKEN;
  extensionRequests.set(requestId, peer);
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
  for (const peer of peers.values()) peer.socket.destroy();
  peers.clear();
}
process.stdin.on('end', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
