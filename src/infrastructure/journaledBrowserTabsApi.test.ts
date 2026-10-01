import { describe, expect, it, vi } from 'vitest';

import { InMemoryOperationJournalStore, OperationJournal } from '../codex/operationJournal';
import { createJournaledBrowserTabsApi } from './journaledBrowserTabsApi';
import type { BrowserSnapshot } from '../domain/types';
import type { BrowserTabsApi } from './browserTabsApi';
import { createSerializedBrowserTabsApi } from './serializedBrowserTabsApi';

describe('createJournaledBrowserTabsApi', () => {
  it('records before and after snapshots around a successful manager mutation', async () => {
    const store = new InMemoryOperationJournalStore();
    const raw = fakeApi([snapshot('Docs'), snapshot('Research')]);
    const api = createJournaledBrowserTabsApi(raw, journal(store), 'manager');

    await api.updateGroup(3, { title: 'Research' });

    expect(raw.updateGroup).toHaveBeenCalledWith(3, { title: 'Research' });
    expect(await store.listOperations()).toEqual([
      expect.objectContaining({
        operationId: 'operation-1',
        source: 'manager',
        operationType: 'updateGroup',
        status: 'succeeded',
        requestSummary: { groupId: 3, changes: { title: 'Research' } }
      })
    ]);
    const [record] = await store.listOperations();
    expect(record.afterSnapshotId).not.toBe(record.beforeSnapshotId);
  });

  it('journals a grouped selection as one operation with the full tab list', async () => {
    const store = new InMemoryOperationJournalStore();
    const raw = { ...fakeApi([snapshot('Docs'), snapshot('Docs')]), groupTabs: vi.fn().mockResolvedValue(undefined) };
    const api = createJournaledBrowserTabsApi(raw, journal(store), 'manager');

    await api.groupTabs!([10, 11], 3);

    expect(raw.groupTabs).toHaveBeenCalledExactlyOnceWith([10, 11], 3);
    expect(await store.listOperations()).toEqual([expect.objectContaining({
      operationType: 'groupTabs', status: 'succeeded', requestSummary: { tabIds: [10, 11], targetGroupId: 3 }
    })]);
    expect(raw.loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it('keeps journal snapshots inside the exclusive command boundary', async () => {
    const store = new InMemoryOperationJournalStore();
    let title = 'Docs';
    let started!: () => void;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const raw = fakeApi([]);
    vi.mocked(raw.loadSnapshot).mockImplementation(async () => snapshot(title));
    vi.mocked(raw.updateGroup).mockImplementation(async (_id, changes) => {
      title = changes.title!;
      if (title === 'First') { started(); await blocked; }
    });
    const api = createSerializedBrowserTabsApi(createJournaledBrowserTabsApi(raw, journal(store), 'manager'));
    const first = api.runExclusive!(async (scoped) => {
      await scoped.updateGroup(3, { title: 'First' });
      await scoped.updateGroup(3, { title: 'Drag finished' });
    });
    await waiting;
    const second = api.updateGroup(3, { title: 'Second' });
    await Promise.resolve();
    expect(raw.updateGroup).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    const records = await store.listOperations();
    expect(records).toHaveLength(3);
    const secondRecord = records.find((record) =>
      (record.requestSummary as { changes?: { title?: string } })?.changes?.title === 'Second')!;
    expect((await store.getSnapshot(secondRecord.beforeSnapshotId))?.workspace.windows[0].groups[0].title).toBe('Drag finished');
    expect((await store.getSnapshot(secondRecord.afterSnapshotId!))?.workspace.windows[0].groups[0].title).toBe('Second');
  });

  it('records the resulting state when a browser operation fails after changing state', async () => {
    const store = new InMemoryOperationJournalStore();
    const raw = fakeApi([snapshot('Docs'), snapshot('Partially moved')]);
    vi.mocked(raw.moveTab).mockRejectedValueOnce(new Error('Destination window was closed.'));
    const api = createJournaledBrowserTabsApi(raw, journal(store), 'manager');

    await expect(api.moveTab(10, 2, 0)).rejects.toThrow('Destination window was closed.');

    expect(await store.listOperations()).toEqual([
      expect.objectContaining({
        operationType: 'moveTab',
        status: 'partially-failed',
        errors: ['Destination window was closed.']
      })
    ]);
  });
});

function journal(store: InMemoryOperationJournalStore) {
  let id = 1;
  return new OperationJournal(store, () => new Date('2026-08-20T00:00:00.000Z'), () => `operation-${id++}`);
}

function fakeApi(snapshots: BrowserSnapshot[]): BrowserTabsApi {
  const loadSnapshot = vi.fn();
  for (const value of snapshots) {
    loadSnapshot.mockResolvedValueOnce(value);
  }

  return {
    activateTab: vi.fn().mockResolvedValue(undefined),
    closeTabs: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn().mockResolvedValue(3),
    discardTabs: vi.fn().mockResolvedValue(undefined),
    loadSnapshot,
    moveGroup: vi.fn().mockResolvedValue(undefined),
    moveTab: vi.fn().mockResolvedValue(undefined),
    moveTabsToGroup: vi.fn().mockResolvedValue(undefined),
    moveTabToGroup: vi.fn().mockResolvedValue(undefined),
    ungroupTabs: vi.fn().mockResolvedValue(undefined),
    updateGroup: vi.fn().mockResolvedValue(undefined)
  };
}

function snapshot(groupTitle: string): BrowserSnapshot {
  return {
    windows: [{ id: 1, focused: true, type: 'normal' }],
    tabs: [
      {
        id: 10,
        windowId: 1,
        index: 0,
        groupId: 3,
        title: 'Guide',
        url: 'https://docs.example.test/guide',
        pinned: false,
        active: true,
        audible: false,
        hostname: 'docs.example.test',
        origin: 'https://docs.example.test',
        protocol: 'https',
        pathname: '/guide',
        isNewTab: false,
        isInternalPage: false,
        isPdf: false
      }
    ],
    groups: [{ id: 3, windowId: 1, title: groupTitle, color: 'blue', collapsed: false }]
  };
}
