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
        results: [{ kind: 'moveTabsToGroup', status: 'succeeded' }],
        state: {
          mode: 'affected',
          affectedTabIds: [10],
          affectedGroupIds: [8],
          snapshot: { fieldSet: 'grouping', snapshot: { tabs: [{ id: 10 }] } }
        }
      }
    });
    expect(api.moveTabsToGroup).toHaveBeenCalledWith([10], 8, 1);
    expect(await store.listOperations()).toEqual([expect.objectContaining({ operationId: 'operation-1', status: 'succeeded' })]);
  });

  it('returns the requested full state when a batch asks for it', async () => {
    const before = snapshot();
    const after = snapshot({ groupId: 8, groupTitle: 'Research' });
    const response = await handleCodexWriteRequest(
      request('tab_group.apply_operations', {
        expectedRevision: createSnapshotEnvelope(before).revision,
        returnState: 'full',
        operations: [{ kind: 'moveTabsToGroup', tabIds: [10], targetGroupId: 8, targetWindowId: 1 }]
      }),
      { api: fakeApi([before, after]), journal: journal() }
    );

    expect(response).toMatchObject({ result: { state: { mode: 'full', snapshot: { fieldSet: 'full' } } } });
  });

  it('creates a short-lived preview plan that can be applied without resending operations', async () => {
    const before = snapshot();
    const after = snapshot({ groupId: 8, groupTitle: 'Research' });
    const api = fakeApi([before, before, after]);
    const services = { api, journal: journal() };
    const previewResponse = await handleCodexWriteRequest(
      request('tab_group.preview_operations', {
        operations: [{ kind: 'moveTabsToGroup', tabIds: [10], targetGroupId: 8, targetWindowId: 1 }]
      }),
      services
    );
    const preview = (previewResponse as { result: { previewId: string; operationHash: string; plannedRevision: string; expiresAt: string } }).result;

    expect(preview.previewId).toMatch(/^preview-/);
    expect(preview.operationHash).toMatch(/^fnv1a64:/);
    expect(preview.plannedRevision).toBe(createSnapshotEnvelope(before).revision);
    expect(Number.isNaN(Date.parse(preview.expiresAt))).toBe(false);

    const applyResponse = await handleCodexWriteRequest(
      request('tab_group.apply_operations', { previewId: preview.previewId }),
      services
    );

    expect(applyResponse).toMatchObject({ result: { status: 'succeeded', preview: { previewId: preview.previewId } } });
    expect(api.moveTabsToGroup).toHaveBeenCalledWith([10], 8, 1);
  });

  it('rejects operations that do not match a preview plan', async () => {
    const before = snapshot();
    const api = fakeApi([before]);
    const services = { api, journal: journal() };
    const previewResponse = await handleCodexWriteRequest(
      request('tab_group.preview_operations', {
        operations: [{ kind: 'moveTabsToGroup', tabIds: [10], targetGroupId: 8, targetWindowId: 1 }]
      }),
      services
    );
    const previewId = (previewResponse as { result: { previewId: string } }).result.previewId;

    const response = await handleCodexWriteRequest(
      request('tab_group.apply_operations', {
        previewId,
        operations: [{ kind: 'moveTabsToGroup', tabIds: [11], targetGroupId: 8, targetWindowId: 1 }]
      }),
      services
    );

    expect(response).toMatchObject({ error: { code: 'stale-preview' } });
    expect(api.moveTabsToGroup).not.toHaveBeenCalled();
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
