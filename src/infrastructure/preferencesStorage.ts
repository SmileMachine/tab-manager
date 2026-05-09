import { defaultPreferences, normalizePreferences, type ManagerPreferences } from '../domain/preferences';

const storageKey = 'managerPreferences';

export async function loadManagerPreferences(): Promise<ManagerPreferences> {
  if (!isStorageAvailable()) {
    return defaultPreferences;
  }

  const result = await chrome.storage.local.get(storageKey);
  return normalizePreferences(result[storageKey]);
}

export async function saveManagerPreferences(preferences: ManagerPreferences): Promise<void> {
  if (!isStorageAvailable()) {
    return;
  }

  await chrome.storage.local.set({ [storageKey]: preferences });
}

function isStorageAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
