import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { publishArtifacts, validateArtifacts } from './artifacts.mjs';
import { acquireLock } from './state.mjs';
async function fixture(root, name, text = 'valid') {
  const directory = path.join(root, name); await mkdir(directory);
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ manifest_version: 3, background: { service_worker: 'background.js' }, action: { default_popup: 'popup.html' } }));
  await writeFile(path.join(directory, 'background.js'), text);
  for (const page of ['popup', 'manager', 'options']) await writeFile(path.join(directory, `${page}.html`), '<script src="/background.js"></script>');
  return directory;
}
test('publication validates before replacement and rolls back a failed directory swap', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tg-artifacts-'));
  try {
    const source = await fixture(root, 'source', 'new');
    const destination = await fixture(root, 'installed', 'previous');
    await assert.rejects(publishArtifacts(source, destination, { renamePath: async (from, to) => {
      if (from.includes('.next-')) throw Error('simulated publish failure');
      return rename(from, to);
    } }), /simulated/);
    assert.equal(await readFile(path.join(destination, 'background.js'), 'utf8'), 'previous');
    await writeFile(path.join(source, 'popup.html'), '<script src="http://localhost:3000/entry.ts"></script>');
    await assert.rejects(publishArtifacts(source, destination, { standalone: true }), /development server/);
    assert.equal(await readFile(path.join(destination, 'background.js'), 'utf8'), 'previous');
    await writeFile(path.join(source, 'popup.html'), '<script src="/background.js"></script>');
    await publishArtifacts(source, destination, { standalone: true });
    assert.equal(await readFile(path.join(destination, 'background.js'), 'utf8'), 'new');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('standalone validation rejects a WXT development background', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tg-validation-'));
  try {
    const source = await fixture(root, 'source', 'wxt:background-initialized');
    await assert.rejects(validateArtifacts(source, true), /development bootstrap/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('one owner per target and owner release is idempotent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tg-lock-'));
  try {
    const release = await acquireLock(root);
    await assert.rejects(acquireLock(root), /Another local runtime/);
    await release(); await release();
    await (await acquireLock(root))();
  } finally { await rm(root, { recursive: true, force: true }); }
});
