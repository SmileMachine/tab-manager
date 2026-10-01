import { describe, expect, it } from 'vitest';
import { loadAgentConnection, loadAgentPrivacySettings, saveAgentConnection, saveAgentPrivacySettings, type AgentStorageAreas } from './storage';

function areas(): AgentStorageAreas {
  const stores = { local: {} as Record<string, unknown>, session: {} as Record<string, unknown> };
  const area = (store: Record<string, unknown>) => ({
    async get(keys?: string | string[]) {
      if (!keys) return { ...store };
      const names = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(names.filter((key) => key in store).map((key) => [key, store[key]]));
    },
    async set(items: Record<string, unknown>) { Object.assign(store, items); },
    async remove(keys: string | string[]) { for (const key of typeof keys === 'string' ? [keys] : keys) delete store[key]; }
  });
  return { local: area(stores.local), session: area(stores.session) };
}

describe('Agent storage', () => {
  it('keeps the default key only in session storage', async () => {
    const storage = areas();
    await saveAgentConnection({ apiRoot: 'https://api.example.test/v1', modelId: 'organizer', apiKey: 'secret' }, storage);
    const connection = await loadAgentConnection(storage);
    expect(connection?.apiKey).toBe('secret');
    expect(connection?.keyRetention).toBe('session');
  });

  it('stores a key locally only after explicit opt-in and supports deletion', async () => {
    const storage = areas();
    await saveAgentConnection({ apiRoot: 'https://api.example.test/v1', modelId: 'organizer', apiKey: 'secret', keyRetention: 'local' }, storage);
    expect(await loadAgentConnection(storage)).toMatchObject({ apiKey: 'secret', keyRetention: 'local' });
    await saveAgentPrivacySettings({ allowPageContent: true }, storage);
    expect(await loadAgentPrivacySettings(storage)).toEqual({ allowPageContent: true });
  });
});
