import { describe, expect, it } from 'vitest';
import { loadAgentChat, loadAgentConnection, loadAgentPrivacySettings, saveAgentChat, saveAgentConnection, saveAgentPrivacySettings, type AgentStorageAreas } from './storage';

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
    expect(connection?.keyRetention).toBe('local');
  });

  it('stores a key locally only after explicit opt-in and supports deletion', async () => {
    const storage = areas();
    await saveAgentConnection({ apiRoot: 'https://api.example.test/v1', modelId: 'organizer', apiKey: 'secret', keyRetention: 'local' }, storage);
    expect(await loadAgentConnection(storage)).toMatchObject({ apiKey: 'secret', keyRetention: 'local' });
    await saveAgentPrivacySettings({ allowPageContent: true, allowAutomaticChanges: true }, storage);
    expect(await loadAgentPrivacySettings(storage)).toEqual({ allowPageContent: true, allowAutomaticChanges: true });
  });
});

  it('persists bounded chat history and marks interrupted turns after reload', async () => {
    const storage = areas();
    await saveAgentChat([
      { id: 'user-1', role: 'user', text: '请整理标签页' },
      {
        id: 'assistant-1',
        role: 'assistant',
        text: '我正在搜索。',
        streaming: true,
        toolCalls: [{ id: 'call-1', name: 'search_tabs', status: 'running' }]
      }
    ], storage);

    await expect(loadAgentChat(storage)).resolves.toEqual([
      { id: 'user-1', role: 'user', text: '请整理标签页', streaming: false, toolCalls: undefined, error: undefined, plan: undefined, planState: undefined },
      {
        id: 'assistant-1',
        role: 'assistant',
        text: '我正在搜索。',
        streaming: false,
        error: 'Agent request was interrupted by a page refresh.',
        toolCalls: [{ id: 'call-1', name: 'search_tabs', status: 'running' }],
        plan: undefined,
        planState: undefined
      }
    ]);
  });

  it('keeps the most recent chat messages only', async () => {
    const storage = areas();
    await saveAgentChat(Array.from({ length: 85 }, (_, index) => ({ id: `message-${index}`, role: 'user' as const, text: String(index) })), storage);
    const messages = await loadAgentChat(storage);
    expect(messages).toHaveLength(80);
    expect(messages[0].id).toBe('message-5');
    expect(messages.at(-1)?.id).toBe('message-84');
  });
