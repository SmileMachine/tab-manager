import { describe, expect, it } from 'vitest';
import { assertPageContentToolEnabled } from './privacy';
import { saveAgentPrivacySettings, type AgentStorageAreas } from './storage';

function storage(): AgentStorageAreas {
  const values = { local: {} as Record<string, unknown>, session: {} as Record<string, unknown> };
  const area = (value: Record<string, unknown>) => ({
    async get(key?: string | string[]) { const keys = key ? (typeof key === 'string' ? [key] : key) : Object.keys(value); return Object.fromEntries(keys.filter((name) => name in value).map((name) => [name, value[name]])); },
    async set(items: Record<string, unknown>) { Object.assign(value, items); },
    async remove(key: string | string[]) { for (const name of typeof key === 'string' ? [key] : key) delete value[name]; }
  });
  return { local: area(values.local), session: area(values.session) };
}

describe('Agent privacy gate', () => {
  it('rejects page content while disabled', async () => {
    await expect(assertPageContentToolEnabled()).rejects.toThrow('privacy-tool-disabled');
  });

});
