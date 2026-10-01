import { describe, expect, it, vi } from 'vitest';

import type { BrowserTabsApi } from './browserTabsApi';
import { createSerializedBrowserTabsApi } from './serializedBrowserTabsApi';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeApi() {
  return {
    activateTab: vi.fn(), closeTabs: vi.fn(), createGroup: vi.fn(), discardTabs: vi.fn(),
    loadSnapshot: vi.fn(), moveGroup: vi.fn(), moveTab: vi.fn(), moveTabsToGroup: vi.fn(),
    moveTabToGroup: vi.fn(), ungroupTabs: vi.fn(), updateGroup: vi.fn()
  } satisfies BrowserTabsApi;
}

describe('createSerializedBrowserTabsApi', () => {
  it('finishes an entire drag before a later bulk grouping request and snapshot read', async () => {
    const raw = fakeApi();
    const started = deferred();
    const release = deferred();
    const calls: string[] = [];
    let groupId = -1;
    raw.moveTabsToGroup.mockImplementation(async (_ids, targetGroupId) => {
      calls.push(`group:${targetGroupId}`);
      groupId = targetGroupId;
      if (targetGroupId === 7) { started.resolve(); await release.promise; }
    });
    raw.moveTab.mockImplementation(async () => { calls.push('drag-order'); groupId = 7; });
    raw.loadSnapshot.mockImplementation(async () => { calls.push('snapshot'); return { groupId }; });
    const api = createSerializedBrowserTabsApi(raw);

    const drag = api.runExclusive!(async (scoped) => {
      await scoped.moveTabsToGroup([1, 2], 7, 1);
      await scoped.moveTab(1, 1, 0);
    });
    await started.promise;
    const bulk = api.moveTabsToGroup([1, 2], 8, 1);
    const snapshot = api.loadSnapshot();
    await Promise.resolve();
    expect(calls).toEqual(['group:7']);

    release.resolve();
    await Promise.all([drag, bulk, snapshot]);
    expect(calls).toEqual(['group:7', 'drag-order', 'group:8', 'snapshot']);
    expect(groupId).toBe(8);
    expect(await snapshot).toEqual({ groupId: 8 });
  });

  it('continues processing later requests after an exclusive operation fails', async () => {
    const raw = fakeApi();
    const api = createSerializedBrowserTabsApi(raw);
    const failed = api.runExclusive!(async () => { throw new Error('Closed window'); });
    const bulk = api.moveTabsToGroup([1], 8, 1);

    await expect(failed).rejects.toThrow('Closed window');
    await bulk;
    expect(raw.moveTabsToGroup).toHaveBeenCalledExactlyOnceWith([1], 8, 1);
  });

  it('serializes optional batch methods without making unsupported methods available', async () => {
    const raw = { ...fakeApi(), moveTabs: vi.fn() };
    const api = createSerializedBrowserTabsApi(raw);
    await api.runExclusive!(async (scoped) => { await scoped.moveTabs!([2, 1], 1, 0); });
    expect(raw.moveTabs).toHaveBeenCalledExactlyOnceWith([2, 1], 1, 0);
    expect(api.createTabs).toBeUndefined();
  });
});
