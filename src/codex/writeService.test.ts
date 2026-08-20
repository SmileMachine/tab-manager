import { describe, expect, it, vi } from 'vitest';

import { InMemoryOperationJournalStore, OperationJournal } from './operationJournal';
import { handleCodexWriteRequest } from './writeService';
import { createSnapshotEnvelope } from './snapshot';
import type { BrowserSnapshot } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { CODEX_PROTOCOL_VERSION } from './protocol';

describe('handleCodexWriteRequest', () => {
  it('previews a group creation without changing browser state', async () => {
    const api = fakeApi([snapshot()]);
    const response = await handleCodexWriteRequest(request('tab_group.preview_operations', {
      operations: [{ kind: 'createGroup', tabIds: [10, 11], windowId: 1, title: 'Docs', color: 'blue' }]
    }), { api, journal: journal() });

    expect(response).toMatchObject({
      result: {
        valid: true,
        items: [{ kind: 'createGroup', valid: true, affectedTabIds: [10, 11] }]
      }
    });
    expect(api.createGroup).not.toHaveBeenCalled();
  });

  it('applies a guarded grouping operation and records its snapshot', async () => {
    const before = snapshot();
    const after = snapshot({ groupId: 8, groupTitle: 'Research' });
    const store = new InMemoryOperationJournalStore();
    const api = fakeApi([before, after]);
    const response = await handleCodexWriteRequest(
      request('tab_group.apply_operations', {
        expectedRevision: createSnapshotEnvelope(before).revision,
        operations: [{ kind: 'moveTabsToGroup', tabIds: [10], targetGroupId: 8, targetWindowId: 1 }]
      }),
      { api, journal: journal(store) }
    );

    expect(response).toMatchObject({
      result: {
        status: 'succeeded',
        operationId: 'operation-1',
        results: [{ kind: 'moveTabsToGroup', status: 'succeeded' }]
      }
    });
    expect(api.moveTabsToGroup).toHaveBeenCalledWith([10], 8, 1);
    expect(await store.listOperations()).toEqual([expect.objectContaining({ operationId: 'operation-1', status: 'succeeded' })]);
  });

  it('rejects stale state before mutating browser state', async () => {
    const api = fakeApi([snapshot()]);
    const response = await handleCodexWriteRequest(
      request('tab_group.update_group', {
        groupId: 3,
        changes: { title: 'New title' },
        expectedRevision: 'fnv1a64:old'
      }),
      { api, journal: journal() }
    );

    expect(response).toMatchObject({ error: { code: 'stale-state' } });
    expect(api.updateGroup).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation for closing tabs', async () => {
    const api = fakeApi([snapshot()]);
    const response = await handleCodexWriteRequest(
      request('tab_group.close_tabs', { tabIds: [10], confirm: false }),
      { api, journal: journal() }
    );

    expect(response).toMatchObject({ error: { code: 'confirmation-required' } });
    expect(api.closeTabs).not.toHaveBeenCalled();
  });
});

function request(method: string, params: Record<string, unknown>) {
  return { protocolVersion: CODEX_PROTOCOL_VERSION, requestId: 'request-1', method, params };
}

function journal(store = new InMemoryOperationJournalStore()) {
  return new OperationJournal(store, () => new Date('2026-08-20T00:00:00.000Z'), () => 'operation-1');
}

function fakeApi(snapshots: BrowserSnapshot[]): BrowserTabsApi {
  const loadSnapshot = vi.fn();
  snapshots.forEach((value) => loadSnapshot.mockResolvedValueOnce(value));
  return {
    activateTab: vi.fn().mockResolvedValue(undefined),
    closeTabs: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn().mockResolvedValue(8),
    discardTabs: vi.fn().mockResolvedValue(undefined),
    loadSnapshot,
    moveGroup: vi.fn().mockResolvedValue(undefined),
    moveTab: vi.fn().mockResolvedValue(undefined),
    moveTabs: vi.fn().mockResolvedValue(undefined),
    moveTabsToGroup: vi.fn().mockResolvedValue(undefined),
    moveTabToGroup: vi.fn().mockResolvedValue(undefined),
    ungroupTabs: vi.fn().mockResolvedValue(undefined),
    updateGroup: vi.fn().mockResolvedValue(undefined),
    updateTab: vi.fn().mockResolvedValue(undefined)
  };
}

function snapshot(options: { groupId?: number; groupTitle?: string } = {}): BrowserSnapshot {
  const groupId = options.groupId ?? 3;
  return {
    windows: [{ id: 1, focused: true, type: 'normal' }],
    tabs: [
      tab({ id: 10, index: 0, groupId }),
      tab({ id: 11, index: 1, groupId })
    ],
    groups: [
      { id: 3, windowId: 1, title: options.groupTitle ?? 'Docs', color: 'blue', collapsed: false },
      { id: 8, windowId: 1, title: 'Research', color: 'purple', collapsed: false }
    ]
  };
}

function tab(overrides: Partial<BrowserSnapshot['tabs'][number]>): BrowserSnapshot['tabs'][number] {
  return {
    id: 1,
    windowId: 1,
    index: 0,
    groupId: 3,
    title: 'Guide',
    url: 'https://docs.example.test/guide',
    pinned: false,
    active: false,
    audible: false,
    hostname: 'docs.example.test',
    origin: 'https://docs.example.test',
    protocol: 'https',
    pathname: '/guide',
    isNewTab: false,
    isInternalPage: false,
    isPdf: false,
    ...overrides
  };
}
