import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const devServerOrigin = process.env.WXT_DEV_SERVER_ORIGIN ?? 'http://localhost:3000';
const pages = ['popup', 'manager'];

function getModuleUrl(html, page) {
  const matches = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)];
  const moduleUrl = matches.at(-1)?.[1];

  if (!moduleUrl) {
    throw new Error(`${page}.html has no module entry script.`);
  }

  return moduleUrl;
}

for (const page of pages) {
  const outputPath = resolve(projectRoot, '.output/edge-mv3-dev', `${page}.html`);
  const html = await readFile(outputPath, 'utf8');
  const moduleUrl = getModuleUrl(html, page);

  if (moduleUrl !== `${devServerOrigin}/entrypoints/${page}/main.tsx`) {
    throw new Error(`${page}.html points to an unexpected development entry module: ${moduleUrl}`);
  }

  const response = await fetch(moduleUrl);
  const moduleCode = await response.text();

  if (!response.ok || !moduleCode.includes('jsxDEV(') || moduleCode.includes('<StrictMode>')) {
    throw new Error(`${page} development entry module was not transformed by Vite.`);
  }
}

console.log('WXT development entrypoints reference Vite-transformed modules.');
