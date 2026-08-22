import { describe, expect, it, vi } from 'vitest';

import { InMemoryOperationJournalStore, OperationJournal } from './operationJournal';
import { handleCodexRollbackRequest } from './rollbackService';
import type { BrowserSnapshot } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';

const requestBase = { protocolVersion: '1.0' as const, requestId: 'request-1' };

describe('Codex rollback service', () => {
  it('previews the before snapshot and identifies extra tabs without mutating', async () => {
    const store = new InMemoryOperationJournalStore();
    const journal = testJournal(store);
    const before = snapshot('Docs', 'Guide', 10);
    const operation = await journal.begin({ source: 'codex', operationType: 'moveTabs', beforeSnapshot: before });
    await journal.complete(operation, { afterSnapshot: snapshot('Work', 'Other', 10) });
    const api = fakeApi(snapshot('Work', 'Other', 10));

    const response = await handleCodexRollbackRequest({
      ...requestBase,
      method: 'tab_group.preview_rollback',
      params: { operationId: operation.operationId }
    }, { api, journal });

    expect(response).toMatchObject({ result: { targetTabCount: 1, targetGroupCount: 1, warnings: expect.any(Array) } });
    expect((response as any).result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'update-group' }),
      expect.objectContaining({ kind: 'update-tab' })
    ]));
    expect(api.updateGroup).not.toHaveBeenCalled();
    expect(api.closeTabs).not.toHaveBeenCalled();
  });

  it('requires confirmation and records a rollback operation after execution', async () => {
    const store = new InMemoryOperationJournalStore();
    const journal = testJournal(store);
    const before = snapshot('Docs', 'Guide', 10);
    const operation = await journal.begin({ source: 'codex', operationType: 'moveTabs', beforeSnapshot: before });
    await journal.complete(operation, { afterSnapshot: snapshot('Work', 'Other', 10) });
    const api = fakeApi(snapshot('Work', 'Other', 10));

    const denied = await handleCodexRollbackRequest({
      ...requestBase,
      requestId: 'denied',
      method: 'tab_group.rollback_operation',
      params: { operationId: operation.operationId }
    }, { api, journal });
    expect(denied).toMatchObject({ error: { code: 'confirmation-required' } });

    const allowed = await handleCodexRollbackRequest({
      ...requestBase,
      requestId: 'allowed',
      method: 'tab_group.rollback_operation',
      params: { operationId: operation.operationId, confirm: true }
    }, { api, journal });
    expect(allowed).toMatchObject({ result: { operationId: 'operation-2', restoredSnapshotId: expect.stringMatching(/^workspace:/) } });
    expect(api.updateGroup).toHaveBeenCalledWith(3, { title: 'Docs', color: 'blue', collapsed: false });
    expect(api.updateTab).toHaveBeenCalledWith(10, { pinned: true });
    expect((await journal.listOperations()).at(-1)).toMatchObject({ source: 'rollback', revertsOperationId: operation.operationId, status: 'rolled-back' });
  });
});

function testJournal(store: InMemoryOperationJournalStore) {
  let id = 0;
  return new OperationJournal(store, () => new Date('2026-08-20T00:00:00.000Z'), () => `operation-${++id}`);
}

function fakeApi(current: BrowserSnapshot): BrowserTabsApi {
  return {
    activateTab: vi.fn().mockResolvedValue(undefined),
    closeTabs: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn().mockResolvedValue(3),
    discardTabs: vi.fn().mockResolvedValue(undefined),
    loadSnapshot: vi.fn().mockResolvedValue(current),
    moveGroup: vi.fn().mockResolvedValue(undefined),
    moveTab: vi.fn().mockResolvedValue(undefined),
    moveTabsToGroup: vi.fn().mockResolvedValue(undefined),
    moveTabToGroup: vi.fn().mockResolvedValue(undefined),
    ungroupTabs: vi.fn().mockResolvedValue(undefined),
    updateGroup: vi.fn().mockResolvedValue(undefined),
    updateTab: vi.fn().mockResolvedValue(undefined)
  };
}

function snapshot(groupTitle: string, title: string, tabId: number): BrowserSnapshot {
  return {
    windows: [{ id: 1, focused: true, type: 'normal' }],
    tabs: [{
      id: tabId, windowId: 1, index: 0, groupId: 3, title,
      url: 'https://docs.example.test/guide', pinned: groupTitle === 'Docs', active: true, audible: false,
      hostname: 'docs.example.test', origin: 'https://docs.example.test', protocol: 'https', pathname: '/guide',
      isNewTab: false, isInternalPage: false, isPdf: false
    }],
    groups: [{ id: 3, windowId: 1, title: groupTitle, color: 'blue', collapsed: false }]
  };
}
