import { describe, expect, it } from 'vitest';

import { normalizeChromeSnapshot } from './browserTabsApi';

describe('normalizeChromeSnapshot', () => {
  it('keeps only windows and tabs with native ids', () => {
    const snapshot = normalizeChromeSnapshot({
      windows: [
        { id: 1, focused: true, type: 'normal' },
        { focused: false, type: 'normal' }
      ],
      tabs: [
        { id: 10, windowId: 1, index: 0, groupId: -1, title: 'Home', pinned: false, active: true },
        { windowId: 1, index: 1, groupId: -1, title: 'Missing id', pinned: false, active: false }
      ],
      groups: [{ id: 5, windowId: 1, title: 'Docs', color: 'blue', collapsed: false }]
    });

    expect(snapshot.windows).toEqual([{ id: 1, focused: true, type: 'normal' }]);
    expect(snapshot.tabs).toEqual([
      {
        id: 10,
        windowId: 1,
        index: 0,
        groupId: -1,
        title: 'Home',
        url: undefined,
        pinned: false,
        active: true,
        audible: false,
        favIconUrl: undefined
      }
    ]);
    expect(snapshot.groups).toEqual([
      { id: 5, windowId: 1, title: 'Docs', color: 'blue', collapsed: false }
    ]);
  });
});
