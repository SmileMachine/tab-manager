import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { controlRequest } from './control-client.mjs';
import { controlSocketPath } from '../../tools/tab-group-native-host/development-control.mjs';

function encode(message) {
  const payload = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
}
const target = { browser: 'edge', installation: 'a'.repeat(32), extensionId: 'b'.repeat(32) };
const token = 'c'.repeat(64);

test('real native host control is authenticated and independent of MCP', async () => {
  const directory = await mkdtemp('/tmp/tg-control-test-');
  process.env.TAB_GROUP_DEVELOPMENT_DIRECTORY = path.join(directory, 'control');
  const child = spawn(process.execPath, ['tools/tab-group-native-host/index.mjs', `chrome-extension://${target.extensionId}/`], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, TAB_GROUP_CODEX_SOCKET_DIRECTORY: path.join(directory, 'no-mcp'), TAB_GROUP_CODEX_LOG: path.join(directory, 'host.log'), TAB_GROUP_CODEX_STATUS: path.join(directory, 'status.json') }
  });
  const messages = [];
  let buffer = Buffer.alloc(0);
  child.stderr.on('data', () => {});
  child.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
      const size = buffer.readUInt32LE(0);
      const message = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
      messages.push(message);
      if (message.kind === 'development-reload') child.stdin.write(encode({ kind: 'development-accepted', protocolVersion: 1, target, requestId: message.requestId }));
    }
  });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    child.stdin.write(encode({ kind: 'development-ready', protocolVersion: 1, target, token, generation: 'baseline', mode: 'standalone', bootId: 'boot-1' }));
    let status;
    for (let i = 0; i < 30; i++) {
      try { status = await controlRequest({ target, token }, 'status'); break; } catch { await new Promise(resolve => setTimeout(resolve, 30)); }
    }
    assert.equal(status.runtime.bootId, 'boot-1');
    assert.equal((await stat(controlSocketPath(target))).mode & 0o777, 0o600);
    const malformed = await new Promise((resolve, reject) => {
      const socket = net.connect(controlSocketPath(target));
      socket.on('error', reject);
      socket.once('connect', () => socket.write('null\n'));
      socket.once('data', data => { socket.destroy(); resolve(JSON.parse(data)); });
    });
    assert.equal(malformed.ok, false);
    await assert.rejects(controlRequest({ target, token: 'd'.repeat(64) }, 'status'), /Unauthorized/);
    await assert.rejects(controlRequest({ target, token }, 'reload', { requestId: 'bad', generation: '', mode: 'development' }), /Invalid/);
    const response = await controlRequest({ target, token }, 'reload', { requestId: 'good', generation: 'next', mode: 'development' });
    assert.equal(response.accepted, true);
    await assert.rejects(controlRequest({ target, token }, 'reload', { requestId: 'good', generation: 'next', mode: 'development' }), /duplicate/);
    assert.equal(messages.filter(message => message.kind === 'development-reload').length, 1);
    // A business RPC cannot address the development reload handler.
    child.stdin.write(encode({ protocolVersion: '1.0', kind: 'request', request: { protocolVersion: '1.0', requestId: 'business', method: 'development.reload' } }));
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(messages.find(message => message.kind === 'response')?.response.error.code, 'transport-unavailable');
    assert.equal(messages.filter(message => message.kind === 'development-reload').length, 1);
    await assert.rejects(controlRequest({ target: { ...target, browser: 'chrome' }, token }, 'status'));
  } finally {
    child.stdin.end(); await exited;
    delete process.env.TAB_GROUP_DEVELOPMENT_DIRECTORY;
    await rm(directory, { recursive: true, force: true });
  }
});

test('accepted reload is not completion: confirmation must match mode, generation and a new boot', async () => {
  const { waitForRuntime } = await import('./control-client.mjs');
  const directory = await mkdtemp('/tmp/tg-confirm-test-');
  process.env.TAB_GROUP_DEVELOPMENT_DIRECTORY = directory;
  let runtime = { generation: 'next', mode: 'development', bootId: 'old-boot' };
  const server = net.createServer(socket => {
    socket.once('data', () => socket.end(JSON.stringify({ ok: true, runtime }) + '\n'));
  });
  await new Promise(resolve => server.listen(controlSocketPath(target), resolve));
  try {
    await assert.rejects(waitForRuntime({ target, token }, { generation: 'next', mode: 'development' }, 60, 'old-boot'), /No confirmation/);
    runtime = { generation: 'wrong', mode: 'development', bootId: 'new-boot' };
    await assert.rejects(waitForRuntime({ target, token }, { generation: 'next', mode: 'development' }, 60, 'old-boot'), /No confirmation/);
    runtime = { generation: 'next', mode: 'development', bootId: 'new-boot' };
    assert.equal((await waitForRuntime({ target, token }, { generation: 'next', mode: 'development' }, 300, 'old-boot')).bootId, 'new-boot');
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete process.env.TAB_GROUP_DEVELOPMENT_DIRECTORY;
    await rm(directory, { recursive: true, force: true });
  }
});
