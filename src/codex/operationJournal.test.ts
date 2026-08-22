import { describe, expect, it } from 'vitest';

import {
  InMemoryOperationJournalStore,
  OperationJournal,
  createWorkspaceSnapshotId
} from './operationJournal';
import { toPortableWorkspace } from './snapshot';
import type { BrowserSnapshot } from '../domain/types';

describe('OperationJournal', () => {
  it('persists before and after portable snapshots for a completed operation', async () => {
    const store = new InMemoryOperationJournalStore();
    const journal = createJournal(store);
    const before = snapshot();
    const after = snapshot({ groupTitle: 'Research', pinned: false });

    const started = await journal.begin({
      source: 'manager',
      operationType: 'updateGroup',
      beforeSnapshot: before,
      expectedRevision: 'fnv1a64:before',
      requestSummary: { groupId: 3 }
    });
    const completed = await journal.complete(started, {
      afterSnapshot: after,
      warnings: ['The browser may change native tab order.']
    });

    expect(started).toMatchObject({
      operationId: 'id-1',
      status: 'pending',
      beforeSnapshotId: expect.stringMatching(/^workspace:/)
    });
    expect(completed).toMatchObject({
      operationId: 'id-1',
      status: 'succeeded',
      afterSnapshotId: expect.stringMatching(/^workspace:/),
      warnings: ['The browser may change native tab order.']
    });
    expect(completed.afterSnapshotId).not.toBe(completed.beforeSnapshotId);
    expect(await store.getOperation('id-1')).toEqual(completed);
    expect(await store.getSnapshot(completed.beforeSnapshotId)).toMatchObject({ workspace: { windows: [{ groups: [{ title: 'Docs' }] }] } });
    expect(await store.getSnapshot(completed.afterSnapshotId!)).toMatchObject({ workspace: { windows: [{ groups: [{ title: 'Research' }] }] } });
  });

  it('deduplicates unchanged snapshots and creates named checkpoints', async () => {
    const store = new InMemoryOperationJournalStore();
    const journal = createJournal(store);
    const source = snapshot();
    const first = await journal.begin({ source: 'codex', operationType: 'moveTabs', beforeSnapshot: source });
    const second = await journal.begin({ source: 'codex', operationType: 'moveTabs', beforeSnapshot: source });
    const checkpoint = await journal.createCheckpoint('Before cleanup', source);

    expect(first.beforeSnapshotId).toBe(second.beforeSnapshotId);
    expect(checkpoint).toMatchObject({ checkpointId: 'id-3', name: 'Before cleanup', snapshotId: first.beforeSnapshotId });
    expect(await journal.listCheckpoints()).toEqual([checkpoint]);
    await expect(journal.createCheckpoint('   ', source)).rejects.toThrow('Checkpoint name cannot be empty.');
  });

  it('prunes unreferenced history while retaining configured operations and checkpoints', async () => {
    const store = new InMemoryOperationJournalStore();
    const journal = createJournal(store);
    const first = await journal.begin({ source: 'codex', operationType: 'first', beforeSnapshot: snapshot() });
    await journal.complete(first, { afterSnapshot: snapshot({ groupTitle: 'First' }) });
    const second = await journal.begin({ source: 'codex', operationType: 'second', beforeSnapshot: snapshot({ groupTitle: 'Second' }) });
    await journal.complete(second, { afterSnapshot: snapshot({ groupTitle: 'Third' }) });
    await journal.createCheckpoint('Keep', snapshot({ groupTitle: 'Keep' }));

    const result = await journal.pruneHistory({ maxOperations: 1, maxCheckpoints: 1, maxSnapshots: 3 });

    expect(result).toMatchObject({ deletedOperations: 1, deletedCheckpoints: 0, retainedOperations: 1, retainedCheckpoints: 1 });
    expect((await journal.listOperations())).toHaveLength(1);
    expect((await store.listSnapshots()).length).toBeLessThanOrEqual(3);
  });

  it('derives the same snapshot id for the same portable workspace document', () => {
    const workspace = toPortableWorkspace(snapshot(), '2026-08-20T00:00:00.000Z');
    const reorderedObject = JSON.parse(JSON.stringify(workspace)) as typeof workspace;

    expect(createWorkspaceSnapshotId(workspace)).toBe(createWorkspaceSnapshotId(reorderedObject));
  });
});

function createJournal(store: InMemoryOperationJournalStore) {
  const dates = [
    new Date('2026-08-20T00:00:00.000Z'),
    new Date('2026-08-20T00:01:00.000Z'),
    new Date('2026-08-20T00:02:00.000Z'),
    new Date('2026-08-20T00:03:00.000Z'),
    new Date('2026-08-20T00:04:00.000Z')
  ];
  let nextDate = 0;
  let nextId = 1;

  return new OperationJournal(store, () => dates[nextDate++] ?? new Date('2026-08-20T00:05:00.000Z'), () => `id-${nextId++}`);
}

function snapshot(options: { groupTitle?: string; pinned?: boolean } = {}): BrowserSnapshot {
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
        pinned: options.pinned ?? true,
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
    groups: [{ id: 3, windowId: 1, title: options.groupTitle ?? 'Docs', color: 'blue', collapsed: false }]
  };
}
