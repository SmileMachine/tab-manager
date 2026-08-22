#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const socketDirectory = process.env.TAB_GROUP_CODEX_SOCKET_DIRECTORY ?? '/tmp/tab-group-codex';
const statusPath = process.env.TAB_GROUP_CODEX_STATUS ?? '/tmp/tab-group-native-host-status.json';
const logPath = process.env.TAB_GROUP_CODEX_LOG ?? '/tmp/tab-group-native-host.log';
const logLines = parsePositiveInt(process.env.TAB_GROUP_CODEX_DIAGNOSTIC_LOG_LINES, 12);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') return { error: error.message };
    return undefined;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function listSockets() {
  try {
    return fs.readdirSync(socketDirectory)
      .filter((name) => name.endsWith('.sock'))
      .map((name) => {
        const socketPath = path.join(socketDirectory, name);
        const stat = fs.statSync(socketPath);
        return { name, path: socketPath, mode: (stat.mode & 0o777).toString(8), modifiedAt: stat.mtime.toISOString() };
      });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    return [{ error: error.message }];
  }
}

function tail(filePath, count) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').trimEnd().split('\n');
    return lines.slice(-count);
  } catch (error) {
    return error.code === 'ENOENT' ? [] : [`无法读取日志：${error.message}`];
  }
}

const status = readJson(statusPath);
const nativeHost = status && !status.error
  ? { ...status, alive: isProcessAlive(status.pid) }
  : status?.error ? { error: status.error } : undefined;

console.log('Tab Group Codex bridge 诊断');
console.log(`MCP socket 目录：${socketDirectory}`);
console.log(`MCP 实例 socket：${listSockets().length}`);
for (const socket of listSockets()) {
  console.log(`  - ${socket.name} mode=${socket.mode} modified=${socket.modifiedAt}`);
}
if (nativeHost) {
  console.log(`Native host：PID ${nativeHost.pid}，${nativeHost.alive ? '运行中' : '进程不存在'}，启动于 ${nativeHost.startedAt}`);
  console.log(`Native host peer：${nativeHost.peers?.length ?? 0}`);
  for (const peer of nativeHost.peers ?? []) {
    const instance = peer.instance;
    console.log(`  - ${peer.id} ${peer.connected ? 'connected' : peer.connecting ? 'connecting' : 'disconnected'} socket=${peer.socketPath}`);
    if (instance) console.log(`    MCP PID=${instance.pid} version=${instance.serverVersion} startedAt=${instance.startedAt}`);
    console.log(`    lastRequest=${peer.lastRequestAt ?? '-'} lastResponse=${peer.lastResponseAt ?? '-'}`);
  }
} else {
  console.log('Native host：没有可读取的状态文件');
}
console.log(`最近 ${logLines} 行 native host 日志：`);
for (const line of tail(logPath, logLines)) console.log(`  ${line}`);
