import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, createServer } from 'wxt';

process.on('disconnect', () => {
  if (server) void server.stop().finally(() => process.exit(1));
  else process.exit(1);
});

const [kind, browser, output] = process.argv.slice(2);
let server;
const pending = new Map();
let nextId = 1;
process.on('message', async message => {
  if (message.kind === 'published') {
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    message.error ? callbacks?.reject(Error(message.error)) : callbacks?.resolve();
  }
  if (message.kind === 'freeze') {
    await server?.watcher.close();
    process.send({ kind: 'frozen' });
  }
  if (message.kind === 'stop') {
    // In a dedicated process, closing the watcher and exiting guarantees no late writes.
    try { await server?.stop(); } finally { process.exit(0); }
  }
});
function published(directory) {
  const id = nextId++;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); process.send({ kind: 'publish', id, directory }); });
}
const config = {
  browser, outDir: output, outDirTemplate: 'extension',
  webExt: { disabled: true },
  hooks: kind === 'serve' ? {
    async 'build:manifestGenerated'(wxt, manifest) {
      // All bundles/public assets exist at this hook; WXT writes the manifest just after it.
      await writeFile(join(wxt.config.outDir, 'manifest.json'), JSON.stringify(manifest));
      await published(wxt.config.outDir);
    }
  } : {}
};
try {
  if (kind === 'build') {
    await build(config);
    process.exit(0);
  } else {
    server = await createServer(config);
    await server.start();
    process.send({ kind: 'started' });
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
