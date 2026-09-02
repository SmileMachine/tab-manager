import { describe, expect, it } from 'vitest';

import type { PortableWorkspace } from '../codex/protocol';
import { createPortableWorkspaceView } from './portableWorkspaceView';

const workspace: PortableWorkspace = {
  schemaVersion: 1,
  exportedAt: '2026-09-02T00:00:00.000Z',
  activeWindowLocalId: 'window-a',
  windows: [{
    localId: 'window-a',
    type: 'normal',
    tabs: [
      { localId: 'tab-a', index: 0, title: 'Example', url: 'https://example.com', pinned: false, active: true, groupLocalId: 'group-a' },
      { localId: 'tab-b', index: 1, title: 'Docs', url: 'https://docs.example.com', pinned: true, active: false, groupLocalId: 'group-a' }
    ],
    groups: [{ localId: 'group-a', title: 'Research', color: 'blue', collapsed: false, tabLocalIds: ['tab-a', 'tab-b'] }]
  }]
};

describe('createPortableWorkspaceView', () => {
  it('adapts portable windows, groups, and tabs to the manager view model', () => {
    const result = createPortableWorkspaceView(workspace);
    const window = result.view.windows[0];

    expect(window).toMatchObject({ focused: true, type: 'normal' });
    expect(window.items).toHaveLength(2);
    expect(window.groupSpans[0]).toMatchObject({ title: 'Research', tabCount: 2 });
    expect(window.items[0].tab).toMatchObject({ title: 'Example', url: 'https://example.com', pinned: false });
    expect(window.items[0].tab.id).toBeLessThan(0);
    expect(result.tabIdByLocalId.get('tab-a')).toBe(window.items[0].tab.id);
    expect(result.tabLocalIdById.get(window.items[1].tab.id)).toBe('tab-b');
  });

  it('keeps snapshots independent from browser native ids', () => {
    const result = createPortableWorkspaceView(workspace);
    expect(result.view.windows[0].id).toBeLessThan(0);
    expect(result.view.windows[0].items[0].tab.windowId).toBe(result.view.windows[0].id);
    expect(result.view.windows[0].items[0].tab.groupId).toBeLessThan(0);
  });
});
