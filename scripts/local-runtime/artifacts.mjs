import { cp, readFile, readdir, rename, rm, mkdir, chmod, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function validateArtifacts(directory, standalone = false) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || !manifest.background?.service_worker || !manifest.action?.default_popup) throw Error('Incomplete MV3 extension manifest.');
  const pages = ['popup.html', 'manager.html', 'options.html'];
  await readFile(path.join(directory, manifest.background.service_worker));
  for (const page of pages) {
    const html = await readFile(path.join(directory, page), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
    if (scripts.length === 0) throw Error(`${page} has no script assets.`);
    for (const script of scripts) {
      if (/^https?:/.test(script)) {
        if (standalone) throw Error(`${page} still depends on a development server.`);
      } else await readFile(path.join(directory, script.replace(/^\//, '')));
    }
  }
  if (standalone) {
    const background = await readFile(path.join(directory, manifest.background.service_worker), 'utf8');
    if (background.includes('wxt:background-initialized') || background.includes('wxt:reload-extension')) throw Error('Standalone background contains WXT development bootstrap.');
  }
  return manifest;
}
export async function protectTree(directory) {
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await protectTree(file);
    else if (entry.isFile()) await chmod(file, 0o600);
    else throw Error('Local runtime assets must not contain symbolic links.');
  }
}

/** Prepare completely off-path, swap, and restore the previous directory on failure. */
export async function publishArtifacts(source, destination, { standalone = false, renamePath = rename } = {}) {
  await validateArtifacts(source, standalone);
  const prepared = `${destination}.next-${randomUUID()}`;
  const previous = `${destination}.previous-${randomUUID()}`;
  let moved = false;
  let installed = false;
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await cp(source, prepared, { recursive: true, errorOnExist: true, force: false });
    await protectTree(prepared);
    try { await lstat(destination); await renamePath(destination, previous); moved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await renamePath(prepared, destination); installed = true; }
    catch (error) { if (moved) await rename(previous, destination); throw error; }
  } finally {
    await rm(prepared, { recursive: true, force: true });
    if (installed && moved) await rm(previous, { recursive: true, force: true });
  }
}
