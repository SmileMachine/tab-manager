/** Real WXT + native-host process integration. A simulated extension is NOT browser acceptance. */
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { installationId } from './state.mjs';
import { controlRequest } from './control-client.mjs';
import { validateArtifacts } from './artifacts.mjs';

const root = process.cwd();
const directory = await mkdtemp('/tmp/tg-wxt-');
const install = path.join(directory, 'installed');
const state = path.join(directory, 'state');
const target = { browser: 'edge', installation: installationId(install), extensionId: 'a'.repeat(32) };
const token = 'b'.repeat(64);
const env = { ...process.env, TAB_GROUP_INSTALLATION_DIRECTORY: install, TAB_GROUP_RUNTIME_STATE: state, TAB_GROUP_DEVELOPMENT_DIRECTORY: path.join(directory, 'control'), TAB_GROUP_CODEX_SOCKET_DIRECTORY: path.join(directory, 'no-mcp'), TAB_GROUP_CODEX_LOG: path.join(directory, 'host.log'), TAB_GROUP_CODEX_STATUS: path.join(directory, 'host-status.json') };
process.env.TAB_GROUP_DEVELOPMENT_DIRECTORY = env.TAB_GROUP_DEVELOPMENT_DIRECTORY;
await mkdir(state, { mode: 0o700 });
await writeFile(path.join(state, 'config.json'), JSON.stringify({ target, token }), { mode: 0o600 });
let host;
let dev;
let output = '';
const modes = [];
const processes = new Set();
function tracked(args, stdio = ['ignore', 'pipe', 'pipe']) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio });
  processes.add(child); child.once('exit', () => processes.delete(child));
  return child;
}
function encode(value) {
  const payload = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(4); header.writeUInt32LE(payload.length); return Buffer.concat([header, payload]);
}
function connectSimulatedExtension(runtime) {
  host = tracked(['tools/tab-group-native-host/index.mjs', `chrome-extension://${target.extensionId}/`], ['pipe', 'pipe', 'pipe']);
  const current = host;
  current.stderr.on('data', () => {});
  let buffer = Buffer.alloc(0);
  current.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
      const size = buffer.readUInt32LE(0); const message = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
      if (message.kind !== 'development-reload') continue;
      current.stdin.write(encode({ protocolVersion: 1, kind: 'development-accepted', target, requestId: message.requestId }));
      setTimeout(async () => {
        current.stdin.end();
        await new Promise(resolve => current.once('exit', resolve));
        modes.push(message.mode);
        connectSimulatedExtension({ generation: message.generation, mode: message.mode });
      }, 100);
    }
  });
  current.stdin.write(encode({ protocolVersion: 1, kind: 'development-ready', target, token, bootId: randomUUID(), ...runtime }));
}
async function waitFor(predicate, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw Error(`Integration timed out.\n${output}`);
}
try {
  const prepare = tracked(['scripts/local-runtime.mjs', 'prepare', 'edge']);
  prepare.stdout.on('data', () => {}); prepare.stderr.on('data', c => { output += c; });
  const prepareExit = await new Promise(resolve => prepare.once('exit', resolve));
  if (prepareExit !== 0) throw Error(output);
  const initial = JSON.parse(await readFile(path.join(state, 'standalone.json'), 'utf8'));
  // Missing host preflight must not touch the usable installation.
  const before = createHash('sha256').update(await readFile(path.join(install, 'background.js'))).digest('hex');
  const missing = tracked(['scripts/local-runtime.mjs', 'dev', 'edge']);
  missing.stdout.on('data', () => {}); missing.stderr.on('data', () => {});
  const failed = await new Promise(resolve => missing.once('exit', resolve));
  if (failed === 0) throw Error('Missing host preflight unexpectedly succeeded.');
  const after = createHash('sha256').update(await readFile(path.join(install, 'background.js'))).digest('hex');
  if (before !== after) throw Error('Missing host modified the usable installation.');
  connectSimulatedExtension({ generation: initial.generation, mode: initial.mode });
  await waitFor(async () => { try { await controlRequest({ target, token }, 'status'); return true; } catch { return false; } });
  dev = tracked(['scripts/local-runtime.mjs', 'dev', 'edge']);
  dev.stdout.on('data', c => { output += c; }); dev.stderr.on('data', c => { output += c; });
  await waitFor(() => output.includes('Development runtime confirmed') || dev.exitCode !== null);
  if (dev.exitCode !== null) throw Error(output);
  const html = await readFile(path.join(install, 'popup.html'), 'utf8');
  const entry = html.match(/src="(http[^\"]*entrypoints\/popup\/main.tsx)"/)?.[1];
  if (!entry || !(await (await fetch(entry)).text()).includes('jsxDEV(')) throw Error('Actual Vite popup transform missing.');
  // Check the real websocket protocol as well as module serving (without claiming React browser HMR).
  const wsUrl = entry.replace(/^http/, 'ws').replace(/\/entrypoints.*$/, '');
  const websocket = new WebSocket(wsUrl, 'vite-hmr');
  await new Promise((resolve, reject) => { websocket.addEventListener('message', event => {
    if (JSON.parse(event.data).type === 'connected') { websocket.close(); resolve(); }
  }); websocket.addEventListener('error', reject); });
  dev.kill('SIGINT');
  dev.kill('SIGTERM');
  await waitFor(() => dev.exitCode !== null, 30000);
  if (dev.exitCode !== 0 || !output.includes('Standalone runtime confirmed')) throw Error(output);
  await validateArtifacts(install, true);
  // Explicit recovery uses the retained build and does not start another dev server.
  const recovery = tracked(['scripts/local-runtime.mjs', 'restore', 'edge']);
  let recoveryOutput = '';
  recovery.stdout.on('data', c => { recoveryOutput += c; }); recovery.stderr.on('data', c => { recoveryOutput += c; });
  const recovered = await new Promise(resolve => recovery.once('exit', resolve));
  if (recovered !== 0 || !recoveryOutput.includes('Standalone runtime confirmed')) throw Error(recoveryOutput);
  if (modes.join(',') !== 'development,standalone,standalone') throw Error(`Incorrect switch order: ${modes}`);
  console.log('PASS: actual WXT module transform and HMR websocket; native-host reload acceptance and fresh-boot confirmation; missing-host non-mutation, idempotent signal cleanup and explicit standalone recovery. Extension/browser side was simulated.');
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  for (const child of processes) {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timer);
  }
  await writeFile('/tmp/tab-group-runtime-integration.log', output);
  await rm(directory, { recursive: true, force: true });
}
