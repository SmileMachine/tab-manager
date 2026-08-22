#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const workspace = process.cwd();
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tgdiag-'));
const socketDirectory = directory;
const statusPath = path.join(directory, 'status.json');
const logPath = path.join(directory, 'native-host.log');
const mcpEnvironment = { ...process.env, TAB_GROUP_CODEX_SOCKET_DIRECTORY: socketDirectory };
const nativeHostEnvironment = { ...mcpEnvironment, TAB_GROUP_CODEX_STATUS: statusPath, TAB_GROUP_CODEX_LOG: logPath };

let nativeHost;
let settled = false;
let timer;
const mcp = spawn(process.execPath, ['tools/tab-group-mcp/index.mjs'], { cwd: workspace, env: mcpEnvironment, stdio: ['pipe', 'pipe', 'inherit'] });
mcp.stdout.on('data', () => {});

function finish(code, message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  mcp.kill('SIGTERM');
  nativeHost?.kill('SIGTERM');
  setTimeout(() => {
    mcp.kill('SIGKILL');
    nativeHost?.kill('SIGKILL');
    fs.rmSync(directory, { recursive: true, force: true });
  }, 200).unref();
  console[code === 0 ? 'log' : 'error'](`${code === 0 ? '✓' : '✗'} ${message}`);
  process.exitCode = code;
}

function statusContainsHello(socketPath) {
  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    const peer = status.peers?.find((candidate) => candidate.instance?.pid === mcp.pid);
    return peer?.connected === true
      && peer.instance?.socketPath === socketPath
      && typeof peer.instance?.startedAt === 'string'
      && typeof peer.connectedAt === 'string';
  } catch {
    return false;
  }
}

function waitForHello(socketPath) {
  if (settled) return;
  if (statusContainsHello(socketPath)) {
    finish(0, `Native host 诊断已记录 MCP PID、socket、启动时间和连接时间（PID ${mcp.pid}）。`);
    return;
  }
  setTimeout(() => waitForHello(socketPath), 10).unref();
}

function waitForSocket() {
  if (settled) return;
  const socketPath = path.join(socketDirectory, `mcp-${mcp.pid}.sock`);
  if (fs.existsSync(socketPath)) {
    nativeHost = spawn(process.execPath, ['tools/tab-group-native-host/index.mjs'], { cwd: workspace, env: nativeHostEnvironment, stdio: ['pipe', 'pipe', 'inherit'] });
    nativeHost.stdout.on('data', () => {});
    nativeHost.on('error', (error) => finish(1, `无法启动 Native host：${error.message}`));
    waitForHello(socketPath);
    return;
  }
  setTimeout(waitForSocket, 10).unref();
}

mcp.on('error', (error) => finish(1, `无法启动 MCP：${error.message}`));
mcp.on('exit', (code) => { if (!settled && code !== 0) finish(1, `MCP 提前退出：${code}`); });
console.log('开始测试 Native host 实例诊断信息');
timer = setTimeout(() => finish(1, 'Native host 未在 5 秒内记录 MCP hello。'), 5_000);
waitForSocket();
