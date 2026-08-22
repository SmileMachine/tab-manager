#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PROTOCOL_VERSION = '1.0';
const DEFAULT_SOCKET_DIRECTORY = '/tmp/tab-group-codex';
const DEFAULT_TIMEOUT_MS = 15_000;

const options = parseArgs(process.argv.slice(2));
const socketDirectory = path.resolve(options.socketDirectory ?? DEFAULT_SOCKET_DIRECTORY);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
const protocolOnly = options.protocolOnly;

fs.mkdirSync(socketDirectory, { recursive: true, mode: 0o700 });

const child = spawn(process.execPath, ['tools/tab-group-mcp/index.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TAB_GROUP_CODEX_SOCKET_DIRECTORY: socketDirectory
  },
  stdio: ['pipe', 'pipe', 'inherit']
});

let stdoutBuffer = '';
let settled = false;
let timer;
let initializeResponse;
let toolsResponse;
let capabilityResponse;

function finish(code, message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  if (message) console.log(message);
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 500);
  process.exitCode = code;
}

function consumeOutput(chunk) {
  stdoutBuffer += chunk;
  while (true) {
    const newline = stdoutBuffer.indexOf('\n');
    if (newline < 0) return;
    const line = stdoutBuffer.slice(0, newline).trim();
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    if (!line) continue;

    let response;
    try {
      response = JSON.parse(line);
    } catch {
      console.error(`[bridge-test] 收到无法解析的 MCP 输出: ${line}`);
      finish(1, '测试失败：MCP 输出不是有效 JSON。');
      return;
    }

    if (response.id === 'initialize') {
      initializeResponse = response;
      printInitializeResult(response);
      continue;
    }
    if (response.id === 'tools') {
      toolsResponse = response;
      printToolsResult(response);
      if (protocolOnly) {
        finish(0, '测试通过：MCP 协议层可用。');
      }
      continue;
    }
    if (response.id === 'capabilities') {
      capabilityResponse = response;
      printCapabilitiesResult(response);
      finish(response.result?.structuredContent || response.result?.content ? 0 : 1,
        response.result?.structuredContent || response.result?.content
          ? '测试通过：MCP 到扩展的完整链路可用。'
          : '测试失败：MCP 返回了错误。');
    }
  }
}

function printInitializeResult(response) {
  if (response.error) {
    console.log(`✗ initialize 失败：${response.error.message}`);
    return;
  }
  console.log(`✓ initialize 成功：${response.result?.serverInfo?.name ?? 'unknown server'}`);
}

function printToolsResult(response) {
  if (response.error) {
    console.log(`✗ tools/list 失败：${response.error.message}`);
    return;
  }
  const tools = response.result?.tools ?? [];
  console.log(`✓ tools/list 成功：发现 ${tools.length} 个工具`);
}

function printCapabilitiesResult(response) {
  if (response.error) {
    console.log(`✗ tab_group.get_capabilities 失败：${response.error.message}`);
    return;
  }
  const content = response.result?.structuredContent ?? response.result?.content;
  console.log(`✓ tab_group.get_capabilities 返回：${summarize(content)}`);
}

function summarize(value) {
  if (value === undefined) return '没有结构化响应';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

function request(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

child.stdout.setEncoding('utf8');
child.stdout.on('data', consumeOutput);
child.on('error', (error) => finish(1, `测试失败：无法启动 MCP server：${error.message}`));
child.on('exit', (code, signal) => {
  if (!settled && code !== 0) finish(1, `测试失败：MCP server 提前退出（code=${code}, signal=${signal ?? 'none'}）。`);
});

timer = setTimeout(() => {
  console.log(`✗ ${timeoutMs}ms 内没有收到完整链路响应。`);
  console.log(`  MCP socket 目录：${socketDirectory}`);
  console.log('  请检查 /tmp/tab-group-native-host.log，以及 Edge 扩展 service worker 是否已连接。');
  finish(2);
}, timeoutMs);

console.log(`开始测试 Codex bridge（socket 目录：${socketDirectory}）`);
request({
  jsonrpc: '2.0',
  id: 'initialize',
  method: 'initialize',
  params: {}
});
request({
  jsonrpc: '2.0',
  id: 'tools',
  method: 'tools/list',
  params: {}
});

if (!protocolOnly) {
  request({
    jsonrpc: '2.0',
    id: 'capabilities',
    method: 'tools/call',
    params: {
      name: 'tab_group.get_capabilities',
      arguments: {}
    }
  });
}

function parseArgs(args) {
  const result = { protocolOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--protocol-only') {
      result.protocolOnly = true;
    } else if (arg === '--socket-directory') {
      result.socketDirectory = args[++index];
    } else if (arg === '--timeout-ms') {
      result.timeoutMs = Number(args[++index]);
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法：node tools/test-codex-bridge.mjs [--protocol-only] [--socket-directory DIR] [--timeout-ms MS]');
      process.exit(0);
    } else {
      console.error(`未知参数：${arg}`);
      process.exit(1);
    }
  }
  if (!Number.isInteger(result.timeoutMs) || result.timeoutMs <= 0) {
    if (result.timeoutMs !== undefined) {
      console.error('--timeout-ms 必须是正整数。');
      process.exit(1);
    }
  }
  return result;
}
