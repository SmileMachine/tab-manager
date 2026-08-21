#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const timeoutMs = parsePositiveInt(process.env.TAB_GROUP_CODEX_TEST_TIMEOUT_MS, 150);
const socketDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-group-bridge-timeout-'));
const mcp = spawn(process.execPath, ['tools/tab-group-mcp/index.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, TAB_GROUP_CODEX_SOCKET_DIRECTORY: socketDirectory, TAB_GROUP_CODEX_TOOL_TIMEOUT_MS: String(timeoutMs) },
  stdio: ['pipe', 'pipe', 'inherit']
});

let mcpOutput = '';
let outputLines = [];
let socketBuffer = '';
let fakeHost;
let firstRequest;
let secondRequest;
let settled = false;
let timer;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function fail(message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  console.error(`✗ ${message}`);
  cleanup();
  process.exitCode = 1;
}

function pass(message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  console.log(`✓ ${message}`);
  cleanup();
  process.exitCode = 0;
}

function cleanup() {
  mcp.kill('SIGTERM');
  setTimeout(() => mcp.kill('SIGKILL'), 300).unref();
  fakeHost?.destroy();
  fs.rmSync(socketDirectory, { recursive: true, force: true });
}

function sendRpc(message) {
  mcp.stdin.write(`${JSON.stringify(message)}\n`);
}

function sendSocket(message) {
  fakeHost.write(`${JSON.stringify(message)}\n`);
}

function consumeMcpOutput(chunk) {
  mcpOutput += chunk;
  while (true) {
    const newline = mcpOutput.indexOf('\n');
    if (newline < 0) return;
    const line = mcpOutput.slice(0, newline).trim();
    mcpOutput = mcpOutput.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); }
    catch { fail(`MCP 输出不是有效 JSON：${line}`); return; }
    outputLines.push(message);
    if (message.id === 'initialize' && message.result) {
      sendRpc({ jsonrpc: '2.0', id: 'timeout-check', method: 'tools/call', params: { name: 'tab_group.get_capabilities', arguments: {} } });
    }
    if (message.id === 'timeout-check') {
      if (message.error?.data?.timeoutMs !== timeoutMs || message.error?.data?.retryable !== true) {
        fail(`超时响应字段不符合预期：${JSON.stringify(message)}`);
        return;
      }
      sendRpc({ jsonrpc: '2.0', id: 'late-response-check', method: 'tools/call', params: { name: 'tab_group.get_capabilities', arguments: {} } });
    }
    if (message.id === 'late-response-check') {
      if (message.error) {
        fail(`迟到响应测试的第二个请求失败：${JSON.stringify(message)}`);
        return;
      }
      pass(`请求超时后返回，迟到响应未污染后续请求（${timeoutMs}ms 测试预算，生产上限 15000ms）`);
    }
  }
}

function consumeSocketOutput(chunk) {
  socketBuffer += chunk;
  while (true) {
    const newline = socketBuffer.indexOf('\n');
    if (newline < 0) return;
    const line = socketBuffer.slice(0, newline).trim();
    socketBuffer = socketBuffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); }
    catch { fail(`fake host 收到无效 JSON：${line}`); return; }
    if (message.kind === 'hello') continue;
    if (message.kind !== 'request') continue;
    if (!firstRequest) {
      firstRequest = message.request;
      setTimeout(() => sendSocket({ protocolVersion: '1.0', kind: 'response', response: { protocolVersion: '1.0', requestId: firstRequest.requestId, result: { late: true } } }), timeoutMs + 40).unref();
      continue;
    }
    secondRequest = message.request;
    sendSocket({ protocolVersion: '1.0', kind: 'response', response: { protocolVersion: '1.0', requestId: secondRequest.requestId, result: { ok: true } } });
  }
}

function waitForSocket() {
  const socketPath = path.join(socketDirectory, `mcp-${mcp.pid}.sock`);
  if (fs.existsSync(socketPath)) {
    fakeHost = net.createConnection(socketPath, () => {
      fakeHost.setEncoding('utf8');
      sendRpc({ jsonrpc: '2.0', id: 'initialize', method: 'initialize', params: {} });
    });
    fakeHost.on('data', consumeSocketOutput);
    fakeHost.on('error', (error) => fail(`fake host socket 错误：${error.message}`));
    return;
  }
  setTimeout(waitForSocket, 10).unref();
}

mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', consumeMcpOutput);
mcp.on('error', (error) => fail(`无法启动 MCP：${error.message}`));
mcp.on('exit', (code) => {
  if (!settled && code !== 0) fail(`MCP 提前退出：${code}`);
});
timer = setTimeout(() => fail(`在 ${timeoutMs * 5}ms 内没有完成超时测试`), timeoutMs * 5);
console.log(`开始测试 MCP 请求超时（测试预算 ${timeoutMs}ms，生产上限 15000ms）`);
waitForSocket();
