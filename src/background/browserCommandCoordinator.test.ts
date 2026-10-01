import { describe, expect, it, vi } from 'vitest';

import type { BrowserSnapshot } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { createBrowserCommandCoordinator } from './browserCommandCoordinator';

function snapshot(): BrowserSnapshot {
  return { windows: [], tabs: [], groups: [] };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function coordinatorFor(api: BrowserTabsApi) {
  return createBrowserCommandCoordinator(api, {
    begin: vi.fn(),
    complete: vi.fn()
  } as never);
}

describe('createBrowserCommandCoordinator', () => {
  it('serializes independent callers and preserves a compound lock boundary', async () => {
    const started = deferred();
    const release = deferred();
    const calls: string[] = [];
    const api: BrowserTabsApi = {
      loadSnapshot: vi.fn().mockResolvedValue(snapshot()),
      moveTabsToGroup: vi.fn().mockImplementation(async (_ids, groupId) => {
        calls.push(`group:${groupId}`);
        if (groupId === 7) {
          started.resolve();
          await release.promise;
        }
      }),
      moveTab: vi.fn().mockImplementation(async () => { calls.push('order'); })
    } as BrowserTabsApi;
    const coordinator = coordinatorFor(api);

    const lock = await coordinator.acquire();
    const first = coordinator.executeCommand({ kind: 'moveTabsToGroup', tabIds: [1, 2], targetGroupId: 7, targetWindowId: 1 }, lock);
    await started.promise;
    const later = coordinator.executeCommand({ kind: 'moveTabsToGroup', tabIds: [1, 2], targetGroupId: 8, targetWindowId: 1 });
    const nested = coordinator.executeCommand({ kind: 'moveTab', tabId: 1, targetWindowId: 1, targetIndex: 0 }, lock);

    await Promise.resolve();
    expect(calls).toEqual(['group:7']);
    release.resolve();
    await first;
    await nested;
    coordinator.release(lock);
    await later;
    expect(calls).toEqual(['group:7', 'order', 'group:8']);
  });

  it('rejects an expired or foreign compound token instead of queuing it', async () => {
    const api: BrowserTabsApi = { loadSnapshot: vi.fn().mockResolvedValue(snapshot()) } as BrowserTabsApi;
    const coordinator = coordinatorFor(api);
    await expect(coordinator.executeCommand({ kind: 'loadSnapshot' }, 'foreign-token')).rejects.toThrow('invalid or expired');
    expect(api.loadSnapshot).not.toHaveBeenCalled();
  });

  it('allows a failed command to be followed by a later command', async () => {
    const api: BrowserTabsApi = {
      loadSnapshot: vi.fn().mockResolvedValue(snapshot()),
      moveTab: vi.fn().mockRejectedValueOnce(new Error('closed')).mockResolvedValueOnce(undefined)
    } as BrowserTabsApi;
    const coordinator = coordinatorFor(api);
    await expect(coordinator.executeCommand({ kind: 'moveTab', tabId: 1, targetWindowId: 1, targetIndex: 0 })).rejects.toThrow('closed');
    await coordinator.executeCommand({ kind: 'moveTab', tabId: 1, targetWindowId: 1, targetIndex: 0 });
    expect(api.moveTab).toHaveBeenCalledTimes(2);
  });
});
