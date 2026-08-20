import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadManagerPreferences, saveManagerPreferences } from './preferencesStorage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('manager preferences storage', () => {
  it('migrates the previous current-window default to every window', async () => {
    installStorage({
      contentWidth: 'readable',
      density: 'comfortable',
      windowScope: { kind: 'current' },
      collapsedGroupIds: [],
      collapsedWindowIds: [],
      windowNames: {}
    });

    await expect(loadManagerPreferences()).resolves.toMatchObject({
      windowScope: { kind: 'all' }
    });
  });

  it('keeps a current-window preference saved by the new version', async () => {
    installStorage({
      contentWidth: 'readable',
      density: 'comfortable',
      windowScope: { kind: 'current' },
      windowScopePreferenceVersion: 1,
      collapsedGroupIds: [],
      collapsedWindowIds: [],
      windowNames: {}
    });

    await expect(loadManagerPreferences()).resolves.toMatchObject({
      windowScope: { kind: 'current' }
    });
  });

  it('writes a version marker with new preferences', async () => {
    const set = installStorage(undefined);

    await saveManagerPreferences({
      contentWidth: 'readable',
      density: 'comfortable',
      windowScope: { kind: 'current' },
      collapsedGroupIds: [],
      collapsedWindowIds: [],
      windowNames: {}
    });

    expect(set).toHaveBeenCalledWith({
      managerPreferences: expect.objectContaining({
        windowScope: { kind: 'current' },
        windowScopePreferenceVersion: 1
      })
    });
  });
});

function installStorage(value: unknown) {
  const set = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ managerPreferences: value }),
        set
      }
    }
  });

  return set;
}
