import { describe, expect, it } from 'vitest';

import { createBrowserSnapshotView } from './snapshot';
import type { BrowserSnapshot } from './types';

describe('createBrowserSnapshotView', () => {
  it('orders tabs by native index within each window', () => {
    const view = createBrowserSnapshotView({
      windows: [
        { id: 2, focused: false, type: 'normal' },
        { id: 1, focused: true, type: 'normal' }
      ],
      tabs: [
        tab({ id: 12, windowId: 1, index: 2, title: 'third' }),
        tab({ id: 10, windowId: 1, index: 0, title: 'first' }),
        tab({ id: 11, windowId: 1, index: 1, title: 'second' }),
        tab({ id: 20, windowId: 2, index: 0, title: 'other' })
      ],
      groups: []
    });

    expect(view.windows.map((window) => window.id)).toEqual([2, 1]);
    expect(view.windows[1].items.map((item) => item.tab.id)).toEqual([10, 11, 12]);
  });

  it('represents native groups as spans in the ordered tab list', () => {
    const view = createBrowserSnapshotView({
      windows: [{ id: 1, focused: true, type: 'normal' }],
      tabs: [
        tab({ id: 1, windowId: 1, index: 0, groupId: -1, title: 'ungrouped before' }),
        tab({ id: 2, windowId: 1, index: 1, groupId: 7, title: 'group start' }),
        tab({ id: 3, windowId: 1, index: 2, groupId: 7, title: 'group end' }),
        tab({ id: 4, windowId: 1, index: 3, groupId: -1, title: 'ungrouped after' })
      ],
      groups: [{ id: 7, windowId: 1, title: 'Research', color: 'blue', collapsed: false }]
    });

    expect(view.windows[0].items.map((item) => item.tab.id)).toEqual([1, 2, 3, 4]);
    expect(view.windows[0].groupSpans).toEqual([
      {
        groupId: 7,
        windowId: 1,
        title: 'Research',
        color: 'blue',
        startIndex: 1,
        endIndex: 2,
        tabIds: [2, 3],
        tabCount: 2
      }
    ]);
  });

  it('keeps ungrouped tabs as regular items rather than a separate container', () => {
    const view = createBrowserSnapshotView({
      windows: [{ id: 1, focused: true, type: 'normal' }],
      tabs: [
        tab({ id: 1, windowId: 1, index: 0, groupId: -1 }),
        tab({ id: 2, windowId: 1, index: 1, groupId: 4 }),
        tab({ id: 3, windowId: 1, index: 2, groupId: -1 })
      ],
      groups: [{ id: 4, windowId: 1, title: 'Docs', color: 'green', collapsed: false }]
    });

    expect(view.windows[0].items).toMatchObject([
      { kind: 'tab', tab: { id: 1, groupId: -1 } },
      { kind: 'tab', tab: { id: 2, groupId: 4 } },
      { kind: 'tab', tab: { id: 3, groupId: -1 } }
    ]);
  });
});

function tab(overrides: Partial<BrowserSnapshot['tabs'][number]>): BrowserSnapshot['tabs'][number] {
  return {
    id: 1,
    windowId: 1,
    index: 0,
    groupId: -1,
    title: 'Untitled',
    url: 'https://example.com',
    pinned: false,
    active: false,
    audible: false,
    favIconUrl: undefined,
    ...overrides
  };
}
