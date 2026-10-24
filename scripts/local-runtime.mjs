import { fork } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { controlRequest, waitForRuntime, requestReload } from './local-runtime/control-client.mjs';
import { publishArtifacts, validateArtifacts } from './local-runtime/artifacts.mjs';
import { createRuntimeLifecycle } from './local-runtime/lifecycle.mjs';
import { acquireLock, loadOrCreateConfig, writeRuntimeState, privateDirectory } from './local-runtime/state.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const command = args[0] ?? 'dev';
const browser = args[1] ?? 'edge';
if (!['dev', 'prepare', 'restore'].includes(command) || !['edge', 'chrome'].includes(browser)) throw Error('Usage: node scripts/local-runtime.mjs <dev|prepare|restore> <edge|chrome>');
const installation = path.resolve(process.env.TAB_GROUP_INSTALLATION_DIRECTORY ?? path.join(root, `.output/${browser}-mv3-dev`));
const state = path.resolve(process.env.TAB_GROUP_RUNTIME_STATE ?? path.join(root, `.output/local-runtime/${browser}`));
await privateDirectory(state);
const unlock = await acquireLock(state);
let worker;
let activeBuild;
let configuration;
let baseline;
let queue = Promise.resolve();
const lifecycle = createRuntimeLifecycle({
  stopDevelopment: async () => {
    if (!lifecycle.published) { await stopWorker(); return; }
    if (worker?.child.connected && worker.child.exitCode === null && worker.child.signalCode === null) {
      worker.child.send({ kind: 'freeze' });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('WXT did not stop watching; restoration will not race active writes.')), 5000);
        worker.child.on('message', function onMessage(message) {
          if (message.kind === 'frozen') { clearTimeout(timer); worker.child.removeListener('message', onMessage); resolve(); }
        });
      });
    }
    await queue.catch(() => {});
  },
  restoreStandalone: async () => { try { await restore(); } finally { await stopWorker(); } },
  release: async () => { try { await stopWorker(); } finally { await unlock(); } }
});

function runtime(mode) {
  return { browser, installation: configuration.target.installation, token: configuration.token, hostName: configuration.hostName, generation: randomUUID(), mode };
}
function spawnWorker(kind, runtimeConfig, output, onPublish) {
  const child = fork(path.join(root, 'scripts/local-runtime/worker.mjs'), [kind, browser, output], {
    cwd: root, stdio: ['pipe', 'inherit', 'inherit', 'ipc'], detached: true,
    env: { ...process.env, TAB_GROUP_LOCAL_RUNTIME: JSON.stringify(runtimeConfig) }
  });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const started = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => { if (code !== 0 || kind === 'serve') reject(Error(`WXT ${kind} worker exited (${code}).`)); else resolve(); });
    child.on('message', message => {
      if (message.kind === 'started') resolve();
      if (message.kind === 'publish') {
        queue = queue.catch(() => {}).then(async () => {
          if (lifecycle.stopping) throw Error('Development is stopping.');
          await onPublish(message.directory);
        });
        queue.then(() => child.connected && child.send({ kind: 'published', id: message.id }), error => {
          if (child.connected) child.send({ kind: 'published', id: message.id, error: error.message });
        });
      }
    });
  });
  // Exit can precede the caller awaiting it; retain the rejection for that await.
  started.catch(() => {});
  return { child, started, exited };
}
async function buildStandalone() {
  const config = runtime('standalone');
  const directory = path.join(state, `build-${config.generation}`);
  try {
    const build = spawnWorker('build', config, directory);
    activeBuild = build;
    await build.started;
    if (lifecycle.stopping && !lifecycle.published) throw Error('Startup interrupted before publication.');
    await validateArtifacts(path.join(directory, 'extension'), true);
    await publishArtifacts(path.join(directory, 'extension'), path.join(state, 'last-standalone'), { standalone: true });
    await writeRuntimeState(state, config);
    return config;
  } finally { activeBuild = undefined; await rm(directory, { recursive: true, force: true }); }
}
async function stopWorker() {
  if (!worker || worker.child.exitCode !== null || worker.child.signalCode !== null) return;
  if (worker.child.connected) worker.child.send({ kind: 'stop' });
  else worker.child.kill('SIGTERM');
  const timer = setTimeout(() => worker.child.kill('SIGKILL'), 5000);
  await worker.exited;
  clearTimeout(timer);
  await queue.catch(() => {});
}
async function restore({ rebuild = true } = {}) {
  if (rebuild) {
    try { baseline = await buildStandalone(); }
    catch (error) { console.error(`Standalone rebuild failed; restoring the last successful build: ${error.message}`); }
  }
  if (!baseline) baseline = JSON.parse(await readFile(path.join(state, 'standalone.json'), 'utf8'));
  await publishArtifacts(path.join(state, 'last-standalone'), installation, { standalone: true });
  await requestReload(configuration, baseline);
  console.log(`Standalone runtime confirmed. Edge/Chrome can use ${installation} without the dev server.`);
}
async function shutdown() { return lifecycle.shutdown(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  // Build workers are detached from terminal signals. Explicitly terminate startup builds;
  // cleanup waits for startup to settle before releasing directory ownership.
  if (activeBuild && !lifecycle.published) activeBuild.child.kill('SIGTERM');
  if (worker && !lifecycle.published && worker.child.exitCode === null) worker.child.kill('SIGTERM');
  void shutdown().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); });
});
try {
  configuration = await loadOrCreateConfig(state, browser, installation);
  if (configuration.target.browser !== browser) throw Error('Runtime configuration browser does not match.');
  if (command === 'prepare') {
    baseline = await buildStandalone();
    await publishArtifacts(path.join(state, 'last-standalone'), installation, { standalone: true });
    console.log(`One-time setup: load/reload ${installation} in the authorized browser profile, then run npm run dev. No per-session manual reload is required.`);
    lifecycle.finishStartup();
    await unlock();
  } else if (command === 'restore') {
    await controlRequest(configuration, 'status');
    await restore({ rebuild: false });
    lifecycle.finishStartup();
    await unlock();
  } else {
    // Preflight before building/publishing: a missing host never destroys the usable installation.
    await waitForRuntime(configuration, undefined, 3000);
    baseline = await buildStandalone();
    if (lifecycle.stopping) throw Error('Development startup interrupted.');
    const development = runtime('development');
    const stage = path.join(state, 'development');
    await mkdir(stage, { recursive: true });
    worker = spawnWorker('serve', development, stage, async directory => {
      await publishArtifacts(directory, installation);
      lifecycle.markPublished();
      await requestReload(configuration, development);
    });
    await worker.started;
    lifecycle.finishStartup();
    console.log(`Development runtime confirmed at ${installation}. WXT/Vite HMR is active. Ctrl+C restores standalone assets.`);
    worker.exited.then(({ code }) => {
      if (!lifecycle.stopping) {
        console.error(`Development worker stopped unexpectedly (${code}); restoring standalone.`);
        void shutdown().then(() => process.exit(1), error => { console.error(error.message); process.exit(1); });
      }
    });
  }
} catch (error) {
  console.error(error.message);
  lifecycle.finishStartup();
  try { await shutdown(); } catch (restoreError) { console.error(`Restoration could not be confirmed: ${restoreError.message}`); }
  process.exitCode = 1;
}
