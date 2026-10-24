import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateArtifacts } from './artifacts.mjs';
for (const browser of ['edge', 'chrome']) {
  const directory = `.output/${browser}-mv3`;
  const manifest = await validateArtifacts(directory, true);
  if (manifest.permissions.includes('alarms')) throw Error(`${browser} release unexpectedly requests alarms.`);
  async function scan(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await scan(file);
      else if (entry.name.endsWith('.js')) {
        const code = await readFile(file, 'utf8');
        for (const forbidden of ['development-ready','development-reload','development-accepted','__TAB_GROUP_LOCAL_RUNTIME__','runtime-generation.json']) {
          if (code.includes(forbidden)) throw Error(`${file} contains local development capability: ${forbidden}`);
        }
      }
    }
  }
  await scan(directory);
  console.log(`PASS: ${browser} release is standalone and contains no local development controller or alarms permission.`);
}
