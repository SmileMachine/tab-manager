import { describe, expect, it, vi } from 'vitest';

import { InMemoryOperationJournalStore, OperationJournal } from '../../codex/operationJournal';
import type { PortableWorkspace } from '../../codex/protocol';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { createSnapshotActions } from './snapshotActions';

function workspace(url = 'https://example.com'): PortableWorkspace {
  return { schemaVersion: 1, exportedAt: '2026-09-02T00:00:00.000Z', windows: [{ localId: 'window-0', type: 'normal', tabs: [{ localId: 'tab-0-0', index: 0, url, title: 'Example', pinned: false, active: true }], groups: [] }] };
}

function fakeApi(loadSnapshot = vi.fn().mockResolvedValue({ windows: [{ id: 4, focused: true, type: 'normal', state: 'normal', tabCount: 0, groupCount: 0 }], tabs: [], groups: [] })): BrowserTabsApi {
  return {
    activateTab: vi.fn(), closeTabs: vi.fn(), createGroup: vi.fn(), discardTabs: vi.fn(), loadSnapshot, moveGroup: vi.fn(), moveTab: vi.fn(), moveTabsToGroup: vi.fn(), ungroupTabs: vi.fn(), updateGroup: vi.fn(), createTabs: vi.fn().mockResolvedValue([22])
  } as unknown as BrowserTabsApi;
}

describe('createSnapshotActions', () => {
  it('creates a named snapshot with a timestamp name and opens selected tabs in the focused window', async () => {
    const journal = new OperationJournal(new InMemoryOperationJournalStore());
    const api = fakeApi();
    const actions = createSnapshotActions(api, api, journal);

    const saved = await actions.createNamedSnapshot();
    expect(saved.checkpoint.name).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    await actions.openSnapshotTabs(workspace(), ['tab-0-0']);
    expect(api.createTabs).toHaveBeenCalledWith([{ windowId: 4, index: -1, url: 'https://example.com', pinned: false, active: false }]);
  });

  it('renames and deletes only the named checkpoint', async () => {
    const journal = new OperationJournal(new InMemoryOperationJournalStore());
    const api = fakeApi();
    const actions = createSnapshotActions(api, api, journal);
    const saved = await actions.createNamedSnapshot('Morning workspace');

    const renamed = await actions.renameNamedSnapshot(saved.checkpoint.checkpointId, 'Workday');
    expect(renamed.checkpoint.name).toBe('Workday');
    expect((await actions.listNamedSnapshots())[0].checkpoint.name).toBe('Workday');

    await actions.deleteNamedSnapshot(saved.checkpoint.checkpointId);
    expect(await actions.listNamedSnapshots()).toEqual([]);
    expect(await actions.getSnapshot(saved.snapshot.snapshotId)).toBeTruthy();
  });

  it('deduplicates automatic timestamp names', async () => {
    const now = new Date(2026, 8, 2, 3, 4, 5);
    const journal = new OperationJournal(new InMemoryOperationJournalStore(), () => now);
    const api = fakeApi();
    const actions = createSnapshotActions(api, api, journal, () => now);

    const first = await actions.createNamedSnapshot();
    const second = await actions.createNamedSnapshot();
    expect(first.checkpoint.name).toBe('2026-09-02 03:04:05');
    expect(second.checkpoint.name).toBe('2026-09-02 03:04:05 (2)');
  });
});
