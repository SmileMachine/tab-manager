#!/usr/bin/env node

import net from 'node:net';

const PROTOCOL_VERSION = '1.0';
const SOCKET_PATH = process.env.TAB_GROUP_CODEX_SOCKET ?? '/tmp/tab-group-codex.sock';
const AUTH_TOKEN = process.env.TAB_GROUP_CODEX_AUTH_TOKEN;
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

let socket;
let socketBuffer = Buffer.alloc(0);
let nativeBuffer = Buffer.alloc(0);
let socketReady;
let shuttingDown = false;
const pending = new Map();

function log(message) {
  process.stderr.write(`[tab-group-native-host] ${message}\n`);
}

function connectSocket() {
  socketReady = new Promise((resolve) => {
    const attempt = () => {
      if (shuttingDown) return;
      const candidate = net.createConnection(SOCKET_PATH);
      let connected = false;
      candidate.once('connect', () => {
        connected = true;
        socket = candidate;
        resolve(candidate);
      });
      candidate.on('data', (chunk) => {
        socketBuffer = Buffer.concat([socketBuffer, chunk]);
        readSocketLines();
      });
      candidate.on('error', (error) => {
        if (connected) log(`socket error: ${error.message}`);
        candidate.destroy();
      });
      candidate.on('close', () => {
        if (!connected) {
          setTimeout(attempt, 250);
          return;
        }
        if (socket === candidate) socket = undefined;
        for (const [requestId, resolvePending] of pending) {
          resolvePending(createResponse(requestId, 'transport-unavailable', 'The local MCP socket disconnected.'));
        }
        pending.clear();
        if (!shuttingDown) connectSocket();
      });
    };
    attempt();
  });
}

function readSocketLines() {
  while (true) {
    const newline = socketBuffer.indexOf(0x0a);
    if (newline < 0) return;
    const line = socketBuffer.subarray(0, newline).toString('utf8').trim();
    socketBuffer = socketBuffer.subarray(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      log('Ignoring malformed socket JSON.');
      continue;
    }
    if (message?.kind === 'request') {
      writeNativeMessage(message);
      continue;
    }
    const requestId = message?.response?.requestId ?? message?.requestId;
    const waiter = requestId === undefined ? undefined : pending.get(String(requestId));
    if (!waiter) continue;
    pending.delete(String(requestId));
    waiter(message);
  }
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
    try {
      await socketReady;
      socket.write(`${JSON.stringify(message)}\n`);
    } catch (error) {
      log(error instanceof Error ? error.message : 'The local MCP socket is unavailable.');
    }
    return;
  }

  const requestId = String(message.request.requestId);
  if (AUTH_TOKEN !== undefined) message.authToken = AUTH_TOKEN;
  try {
    await socketReady;
    const response = await new Promise((resolve) => {
      pending.set(requestId, resolve);
      socket.write(`${JSON.stringify(message)}\n`);
    });
    writeNativeMessage(response);
  } catch (error) {
    writeNativeMessage(createResponse(requestId, 'transport-unavailable', error instanceof Error ? error.message : 'The local MCP socket is unavailable.'));
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
    response: {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      error: { code, message }
    }
  };
}

function writeNativeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

connectSocket();
process.stdin.on('data', (chunk) => {
  nativeBuffer = Buffer.concat([nativeBuffer, chunk]);
  readNativeMessages();
});
process.stdin.on('end', () => {
  shuttingDown = true;
  socket?.end();
});
process.on('SIGTERM', () => { shuttingDown = true; socket?.destroy(); });
