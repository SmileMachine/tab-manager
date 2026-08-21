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
const launcherPath = `${hostPath}.launcher`;
const dryRun = args.has('dry-run');
if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
  fail('--extension-id must be the 32-character unpacked extension ID.');
}
if (browser !== 'chrome' && browser !== 'edge') fail('--browser must be chrome or edge.');
if (!fs.existsSync(hostPath)) fail(`Native host executable does not exist: ${hostPath}`);

const manifest = {
  name: HOST_NAME,
  description: 'Local Codex bridge for Tab Group Manager',
  path: launcherPath,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${extensionId}/`]
};
const manifestDirectory = nativeMessagingDirectory(browser);
const manifestPath = path.join(manifestDirectory, `${HOST_NAME}.json`);

process.stdout.write(`${JSON.stringify({ manifestPath, manifest }, null, 2)}\n`);
if (!dryRun) {
  writeLauncher(launcherPath, hostPath);
  fs.mkdirSync(manifestDirectory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Installed ${manifestPath}\n`);
}


function writeLauncher(targetPath, scriptPath) {
  const content = `#!/bin/sh
set -eu

script_path=${shellQuote(scriptPath)}

for candidate in \
  \"$HOME\"/.local/share/fnm/node-versions/*/installation/bin/node \
  \"$HOME\"/.local/state/fnm_multishells/*/bin/node \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  /usr/bin/node
 do
  if [ -x \"$candidate\" ]; then
    exec \"$candidate\" \"$script_path\" \"$@\"
  fi
done

if command -v node >/dev/null 2>&1; then
  exec \"$(command -v node)\" \"$script_path\" \"$@\"
fi

printf '%s\\n' 'Unable to find a Node.js executable for the Tab Group Manager native host.' >&2
exit 127
`;
  fs.writeFileSync(targetPath, content, { mode: 0o700 });
  fs.chmodSync(targetPath, 0o700);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
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
