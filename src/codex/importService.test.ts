import { describe, expect, it, vi } from 'vitest';

import { InMemoryOperationJournalStore, OperationJournal } from './operationJournal';
import { handleCodexImportRequest } from './importService';
import type { PortableWorkspace } from './protocol';
import type { BrowserSnapshot } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';

const workspace: PortableWorkspace = {
  schemaVersion: 1,
  exportedAt: '2026-08-20T00:00:00.000Z',
  windows: [{
    localId: 'window-0', type: 'normal', tabs: [{
      localId: 'tab-0-0', index: 0, title: 'Guide', url: 'https://docs.example.test/guide', pinned: true, active: true, groupLocalId: 'group-0-0'
    }],
    groups: [{ localId: 'group-0-0', title: 'Docs', color: 'blue', collapsed: false, tabLocalIds: ['tab-0-0'] }]
  }]
};

describe('Codex workspace import service', () => {
  it('validates and previews an append import without mutating browser state', async () => {
    const api = fakeApi();
    const journal = testJournal();
    const response = await handleCodexImportRequest({ protocolVersion: '1.0', requestId: 'preview', method: 'tab_group.preview_import', params: { workspace } }, { api, journal });

    expect(response).toMatchObject({ result: { mode: 'append', valid: true, requiresConfirmation: true } });
    expect((response as any).result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'window', localId: 'window-0', status: 'create' }),
      expect.objectContaining({ kind: 'tab', localId: 'tab-0-0', status: 'create' }),
      expect.objectContaining({ kind: 'group', localId: 'group-0-0', status: 'create' })
    ]));
    expect(api.createTabs).not.toHaveBeenCalled();
  });

  it('requires confirmation and returns imported ID mappings with a journal record', async () => {
    const api = fakeApi();
    const journal = testJournal();
    const denied = await handleCodexImportRequest({ protocolVersion: '1.0', requestId: 'denied', method: 'tab_group.import_workspace', params: { workspace } }, { api, journal });
    expect(denied).toMatchObject({ error: { code: 'confirmation-required' } });

    const allowed = await handleCodexImportRequest({ protocolVersion: '1.0', requestId: 'allowed', method: 'tab_group.import_workspace', params: { workspace, confirm: true } }, { api, journal });
    expect(allowed).toMatchObject({ result: { operationId: 'operation-1', mode: 'append', windowIdMap: { 'window-0': 1 }, tabIdMap: { 'tab-0-0': 20 }, groupIdMap: { 'group-0-0': 5 } } });
    expect(api.createTabs).toHaveBeenCalledWith([{ windowId: 1, index: -1, url: 'https://docs.example.test/guide', pinned: true, active: false }]);
    expect(api.createGroup).toHaveBeenCalledWith([20], 1, 'Docs', 'blue');
    expect((await journal.listOperations())[0]).toMatchObject({ source: 'import', operationType: 'importWorkspace:append', status: 'succeeded' });
  });

  it('rejects malformed workspaces before creating an operation record', async () => {
    const api = fakeApi();
    const journal = testJournal();
    const response = await handleCodexImportRequest({ protocolVersion: '1.0', requestId: 'invalid', method: 'tab_group.import_workspace', params: { workspace: { schemaVersion: 1, windows: [{ localId: 'same', type: 'normal', tabs: [], groups: [] }, { localId: 'same', type: 'normal', tabs: [], groups: [] }] }, confirm: true } }, { api, journal });
    expect(response).toMatchObject({ error: { code: 'invalid-params' } });
    expect(await journal.listOperations()).toEqual([]);
  });
});

function testJournal() {
  let id = 0;
  return new OperationJournal(new InMemoryOperationJournalStore(), () => new Date('2026-08-20T00:00:00.000Z'), () => `operation-${++id}`);
}

function fakeApi(): BrowserTabsApi {
  const snapshot = currentSnapshot();
  return {
    activateTab: vi.fn().mockResolvedValue(undefined),
    closeTabs: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn().mockResolvedValue(5),
    createTabs: vi.fn().mockResolvedValue([20]),
    discardTabs: vi.fn().mockResolvedValue(undefined),
    loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    moveGroup: vi.fn().mockResolvedValue(undefined),
    moveTab: vi.fn().mockResolvedValue(undefined),
    moveTabsToGroup: vi.fn().mockResolvedValue(undefined),
    moveTabToGroup: vi.fn().mockResolvedValue(undefined),
    ungroupTabs: vi.fn().mockResolvedValue(undefined),
    updateGroup: vi.fn().mockResolvedValue(undefined)
  };
}

function currentSnapshot(): BrowserSnapshot {
  return { windows: [{ id: 1, focused: true, type: 'normal' }], tabs: [], groups: [] };
}
