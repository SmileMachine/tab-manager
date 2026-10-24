import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, lstat, chmod, unlink } from 'node:fs/promises';

export function controlDirectory() {
  return process.env.TAB_GROUP_DEVELOPMENT_DIRECTORY ?? path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), `tg-dev-${process.getuid?.() ?? os.userInfo().username}`);
}
export function controlSocketPath(target) {
  const hash = createHash('sha256').update(JSON.stringify([target.browser, target.installation, target.extensionId])).digest('hex').slice(0, 28);
  const result = path.join(controlDirectory(), `${hash}.sock`);
  if (Buffer.byteLength(result) > 100) throw Error('Development control socket path is too long; use a short private directory.');
  return result;
}
export function validTarget(target) {
  return target && ['edge', 'chrome'].includes(target.browser) && /^[a-f0-9]{32}$/.test(target.installation) && /^[a-p]{32}$/.test(target.extensionId);
}
function sameTarget(a, b) { return validTarget(a) && validTarget(b) && a.browser === b.browser && a.installation === b.installation && a.extensionId === b.extensionId; }
function sameSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === b.length && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw Error('Unsafe development control directory.');
  await chmod(directory, 0o700);
}

/** Independent of MCP discovery and sockets. Only a local-runtime handshake enables this server. */
export function createDevelopmentControlHost({ origin, send }) {
  let ready;
  let server;
  let socketPath;
  let ownedInode;
  let closed = false;
  const pending = new Map();
  const clients = new Set();
  const seenRequests = new Set();
  async function handle(message) {
    if (!message || !['development-ready', 'development-accepted'].includes(message.kind)) return false;
    if (message.kind === 'development-accepted') {
      const item = pending.get(message.requestId);
      if (item && sameTarget(message.target, ready?.target) && message.protocolVersion === 1) {
        clearTimeout(item.timer);
        pending.delete(message.requestId);
        item.socket.end(JSON.stringify({ ok: true, accepted: true }) + '\n');
      }
      return true;
    }
    if (ready || closed || message.protocolVersion !== 1 || !validTarget(message.target) ||
      origin !== `chrome-extension://${message.target.extensionId}/` || !sameSecret(message.token, message.token) ||
      typeof message.bootId !== 'string' || message.bootId.length > 100 || !message.bootId ||
      typeof message.generation !== 'string' || !message.generation || message.generation.length > 100 ||
      !['standalone', 'development'].includes(message.mode)) return true;
    ready = { target: message.target, token: message.token, generation: message.generation, mode: message.mode, bootId: message.bootId };
    try {
      await privateDirectory(controlDirectory());
      socketPath = controlSocketPath(ready.target);
      // Never unlink a live endpoint owned by another connected instance.
      try {
        const existing = await lstat(socketPath);
        if (!existing.isSocket() || (process.getuid && existing.uid !== process.getuid())) throw Error('Unsafe existing development endpoint.');
        const active = await new Promise((resolve) => {
          const probe = net.connect(socketPath);
          probe.once('connect', () => { probe.destroy(); resolve(true); });
          probe.once('error', () => resolve(false));
        });
        if (active) throw Error('Development endpoint already belongs to a connected runtime.');
        await unlink(socketPath);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (closed) return true;
      server = net.createServer(socket => {
        clients.add(socket);
        socket.on('error', () => {});
        socket.on('close', () => clients.delete(socket));
        socket.setTimeout(5000, () => socket.destroy());
        let buffer = '';
        let handled = false;
        socket.on('data', chunk => {
          if (handled) return;
          buffer += chunk;
          if (buffer.length > 8192) { socket.destroy(); return; }
          if (!buffer.includes('\n')) return;
          handled = true;
          let request;
          try { request = JSON.parse(buffer.slice(0, buffer.indexOf('\n'))); } catch { socket.end('{"ok":false,"error":"Invalid JSON"}\n'); return; }
          const fail = error => socket.end(JSON.stringify({ ok: false, error }) + '\n');
          if (!request || typeof request !== 'object' || Array.isArray(request) || request.protocolVersion !== 1 || !sameTarget(request.target, ready.target) || !sameSecret(request.token, ready.token)) { fail('Unauthorized development control request.'); return; }
          if (request.kind === 'status') {
            socket.end(JSON.stringify({ ok: true, runtime: { target: ready.target, generation: ready.generation, mode: ready.mode, bootId: ready.bootId } }) + '\n'); return;
          }
          if (request.kind !== 'reload' || typeof request.requestId !== 'string' || request.requestId.length > 100 ||
            typeof request.generation !== 'string' || !request.generation || request.generation.length > 100 ||
            !['standalone', 'development'].includes(request.mode) || seenRequests.has(request.requestId) || seenRequests.size >= 1000) {
            fail('Invalid or duplicate development reload.'); return;
          }
          seenRequests.add(request.requestId);
          const timer = setTimeout(() => { pending.delete(request.requestId); fail('Extension did not accept reload.'); }, 3000);
          pending.set(request.requestId, { socket, timer });
          send({ ...request, kind: 'development-reload' });
        });
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
      await chmod(socketPath, 0o600);
      ownedInode = (await lstat(socketPath)).ino;
      if (closed) await close();
    } catch (error) {
      console.error('[tab-group development] Unable to start local control:', error.message);
    }
    return true;
  }
  async function close() {
    closed = true;
    for (const { timer } of pending.values()) clearTimeout(timer);
    pending.clear();
    for (const client of clients) client.destroy();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    try { if (ownedInode && (await lstat(socketPath)).ino === ownedInode) await unlink(socketPath); } catch (error) { if (error.code !== 'ENOENT') console.error(error.message); }
  }
  return { handle, close };
}
