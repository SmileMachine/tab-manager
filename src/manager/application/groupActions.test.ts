import { describe, expect, it, vi } from 'vitest';

import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { updateGroup } from './groupActions';

describe('groupActions', () => {
  it('updates a group and optionally refreshes after success', async () => {
    const api = fakeApi();
    const refresh = vi.fn();
    const notify = vi.fn();

    await updateGroup({ api, groupId: 5, changes: { title: 'Docs', color: 'blue' }, refresh, notify });

    expect(api.updateGroup).toHaveBeenCalledWith(5, { title: 'Docs', color: 'blue' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports unavailable browser API without updating a group', async () => {
    const notify = vi.fn();
    const refresh = vi.fn();

    await updateGroup({ api: undefined, groupId: 5, changes: { title: 'Docs' }, refresh, notify });

    expect(refresh).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Browser API unavailable.');
  });
});

function fakeApi(): BrowserTabsApi {
  return {
    activateTab: vi.fn().mockResolvedValue(undefined),
    closeTabs: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn().mockResolvedValue(1),
    discardTabs: vi.fn().mockResolvedValue(undefined),
    loadSnapshot: vi.fn().mockRejectedValue(new Error('not used')),
    moveGroup: vi.fn().mockResolvedValue(undefined),
    moveTab: vi.fn().mockResolvedValue(undefined),
    moveTabsToGroup: vi.fn().mockResolvedValue(undefined),
    moveTabToGroup: vi.fn().mockResolvedValue(undefined),
    ungroupTabs: vi.fn().mockResolvedValue(undefined),
    updateGroup: vi.fn().mockResolvedValue(undefined)
  };
}
