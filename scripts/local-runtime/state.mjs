import { mkdir, readFile, writeFile, open, rm, lstat, chmod, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, createHash, randomUUID } from 'node:crypto';

export function installationId(directory) { return createHash('sha256').update(path.resolve(directory)).digest('hex').slice(0, 32); }
export async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw Error('Unsafe local runtime state directory.');
  await chmod(directory, 0o700);
}
export async function acquireLock(directory) {
  await privateDirectory(directory);
  const lock = path.join(directory, 'owner.json');
  for (let attempt = 0; attempt < 2; attempt++) {
    const identity = randomUUID();
    try {
      const file = await open(lock, 'wx', 0o600);
      await file.writeFile(JSON.stringify({ pid: process.pid, identity })); await file.close();
      return async () => {
        try { if (JSON.parse(await readFile(lock, 'utf8')).identity === identity) await rm(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let previous;
      try { previous = JSON.parse(await readFile(lock, 'utf8')); } catch { throw Error('Unreadable runtime lock; inspect it before recovery.'); }
      if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw Error('Invalid runtime owner lock.');
      try { process.kill(previous.pid, 0); throw Error(`Another local runtime command owns this target (PID ${previous.pid}).`); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      await rm(lock);
    }
  }
  throw Error('Unable to obtain local runtime ownership.');
}
export async function loadOrCreateConfig(state, browser, installationDirectory) {
  const file = path.join(state, 'config.json');
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved.target?.browser !== browser || saved.target?.installation !== installationId(installationDirectory) ||
      !/^[a-p]{32}$/.test(saved.target?.extensionId ?? '') || !/^[a-f0-9]{64}$/.test(saved.token ?? '')) throw Error('Local runtime configuration does not match this target; inspect it before rebuilding.');
    await chmod(file, 0o600);
    return saved;
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const name = browser === 'edge' ? 'Microsoft Edge' : 'Google/Chrome';
  const registrationPath = process.env.TAB_GROUP_HOST_MANIFEST ?? path.join(os.homedir(), 'Library/Application Support', name, 'NativeMessagingHosts/com.shawn.tab_group.codex.json');
  const manifest = JSON.parse(await readFile(registrationPath, 'utf8').catch(() => { throw Error('Install and authorize the Native Messaging host first; see docs/codex-native-messaging.md.'); }));
  const ids = (manifest.allowed_origins ?? []).map(origin => /^chrome-extension:\/\/([a-p]{32})\/$/.exec(origin)?.[1]).filter(Boolean);
  const extensionId = process.env.TAB_GROUP_EXTENSION_ID ?? (ids.length === 1 ? ids[0] : undefined);
  if (!extensionId || !ids.includes(extensionId)) throw Error('Set TAB_GROUP_EXTENSION_ID to an extension ID authorized by the native host.');
  const config = { hostName: manifest.name, target: { browser, installation: installationId(installationDirectory), extensionId }, token: randomBytes(32).toString('hex') };
  await writeFile(file, JSON.stringify(config), { mode: 0o600, flag: 'wx' });
  return config;
}
export async function writeRuntimeState(state, runtime) {
  const temp = path.join(state, `runtime-${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(runtime), { mode: 0o600 });
  await rename(temp, path.join(state, 'standalone.json'));
}
