import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { controlSocketPath } from '../../tools/tab-group-native-host/development-control.mjs';

export function controlRequest(config, kind, extra = {}, timeout = 4500) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(controlSocketPath(config.target));
    let buffer = '';
    const timer = setTimeout(() => socket.destroy(Error('Timed out waiting for local development host.')), timeout);
    const finish = (error, value) => {
      clearTimeout(timer); socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.on('error', error => finish(error));
    socket.on('connect', () => socket.write(JSON.stringify({ protocolVersion: 1, kind, target: config.target, token: config.token, ...extra }) + '\n'));
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 16384) { finish(Error('Oversized local host response.')); return; }
      if (!buffer.includes('\n')) return;
      try {
        const value = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
        if (!value.ok) finish(Error(value.error ?? 'Local host rejected the request.'));
        else finish(undefined, value);
      } catch (error) { finish(error); }
    });
    socket.on('end', () => { if (!buffer.includes('\n')) finish(Error('Local host disconnected before responding.')); });
  });
}
export async function waitForRuntime(config, expected, timeout = 15000, previousBoot) {
  const until = Date.now() + timeout;
  let lastError;
  while (Date.now() < until) {
    try {
      const result = await controlRequest(config, 'status');
      if (!expected || (result.runtime.generation === expected.generation && result.runtime.mode === expected.mode && result.runtime.bootId !== previousBoot)) return result.runtime;
    } catch (error) { lastError = error; }
    // Bounded command-time confirmation, not a background availability poll.
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw Error(`No confirmation from the target extension. Check host installation, protocol upgrade and extension authorization.${lastError ? ` ${lastError.message}` : ''}`);
}
export async function requestReload(config, runtime) {
  const previous = await controlRequest(config, 'status');
  const requestId = randomUUID();
  await controlRequest(config, 'reload', { requestId, generation: runtime.generation, mode: runtime.mode });
  // Allow the old host to exit before observing the fresh connection.
  await new Promise(resolve => setTimeout(resolve, 250));
  return waitForRuntime(config, runtime, 15000, previous.runtime.bootId);
}
