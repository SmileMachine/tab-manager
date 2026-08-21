#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const HOST_NAME = 'com.shawn.tab_group.codex';
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith('--')) continue;
  const [key, inline] = value.slice(2).split('=', 2);
  args.set(key, inline ?? process.argv[++index]);
}

const extensionId = args.get('extension-id');
const browser = args.get('browser') ?? 'chrome';
const hostPath = path.resolve(args.get('host-path') ?? 'tools/tab-group-native-host/index.mjs');
const dryRun = args.has('dry-run');
if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
  fail('--extension-id must be the 32-character unpacked extension ID.');
}
if (browser !== 'chrome' && browser !== 'edge') fail('--browser must be chrome or edge.');
if (!fs.existsSync(hostPath)) fail(`Native host executable does not exist: ${hostPath}`);

const manifest = {
  name: HOST_NAME,
  description: 'Local Codex bridge for Tab Group Manager',
  path: hostPath,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${extensionId}/`]
};
const manifestDirectory = nativeMessagingDirectory(browser);
const manifestPath = path.join(manifestDirectory, `${HOST_NAME}.json`);

process.stdout.write(`${JSON.stringify({ manifestPath, manifest }, null, 2)}\n`);
if (!dryRun) {
  fs.mkdirSync(manifestDirectory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Installed ${manifestPath}\n`);
}

function nativeMessagingDirectory(browserName) {
  if (process.platform === 'darwin') {
    return browserName === 'edge'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts')
      : path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
  }
  if (process.platform === 'win32') {
    fail('Windows Native Messaging host registration requires the browser registry; use the generated manifest with a registry entry.');
  }
  return path.join(os.homedir(), '.config', browserName === 'edge' ? 'microsoft-edge' : 'google-chrome', 'NativeMessagingHosts');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
