import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeLifecycle } from './lifecycle.mjs';

test('shutdown waits for startup and repeated signals restore and release only once', async () => {
  const calls = [];
  const lifecycle = createRuntimeLifecycle({ stopDevelopment: async () => calls.push('stop'), restoreStandalone: async () => calls.push('restore'), release: async () => calls.push('release') });
  lifecycle.markPublished();
  const first = lifecycle.shutdown();
  assert.equal(first, lifecycle.shutdown());
  await Promise.resolve();
  assert.deepEqual(calls, []);
  lifecycle.finishStartup(); await first;
  assert.deepEqual(calls, ['stop', 'restore', 'release']);
});
test('a preflight failure releases ownership without publishing or restoring', async () => {
  const calls = [];
  const lifecycle = createRuntimeLifecycle({ stopDevelopment: async () => calls.push('stop'), restoreStandalone: async () => calls.push('restore'), release: async () => calls.push('release') });
  lifecycle.finishStartup(); await lifecycle.shutdown();
  assert.deepEqual(calls, ['stop', 'release']);
});
test('restoration failures still release ownership and do not run again', async () => {
  let released = 0;
  const lifecycle = createRuntimeLifecycle({ stopDevelopment: async () => {}, restoreStandalone: async () => { throw Error('no host confirmation'); }, release: async () => { released++; } });
  lifecycle.markPublished(); lifecycle.finishStartup();
  await assert.rejects(lifecycle.shutdown(), /no host/);
  await assert.rejects(lifecycle.shutdown(), /no host/);
  assert.equal(released, 1);
});
