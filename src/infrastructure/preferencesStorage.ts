import { defaultPreferences, normalizePreferences, type ManagerPreferences } from '../domain/preferences';

const storageKey = 'managerPreferences';
const windowScopePreferenceVersion = 1;

export async function loadManagerPreferences(): Promise<ManagerPreferences> {
  if (!isStorageAvailable()) {
    return defaultPreferences;
  }

  const result = await chrome.storage.local.get(storageKey);
  return normalizePreferences(migrateWindowScopePreference(result[storageKey]));
}

export async function saveManagerPreferences(preferences: ManagerPreferences): Promise<void> {
  if (!isStorageAvailable()) {
    return;
  }

  await chrome.storage.local.set({
    [storageKey]: {
      ...preferences,
      windowScopePreferenceVersion
    }
  });
}

function isStorageAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function migrateWindowScopePreference(value: unknown): unknown {
  if (!isRecord(value) || value.windowScopePreferenceVersion === windowScopePreferenceVersion) {
    return value;
  }

  return {
    ...value,
    windowScope: defaultPreferences.windowScope
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
