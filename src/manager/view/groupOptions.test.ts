import { describe, expect, it } from 'vitest';

import type { BrowserSnapshotView, WindowView } from '../../domain/types';
import { displayNameForWindow, groupsFromView, windowsFromView } from './groupOptions';

describe('window display options', () => {
  it('uses custom window names as the single display source for window and group options', () => {
    const view: BrowserSnapshotView = {
      windows: [
        windowView({ id: 10, groupId: 100 }),
        windowView({ id: 12, groupId: 120 })
      ]
    };
    const names = { 10: 'Research', 12: 'Work' };

    expect(displayNameForWindow(10, 0, names)).toBe('Research');
    expect(windowsFromView(view, names).map((window) => window.name)).toEqual(['Research', 'Work']);
    expect(groupsFromView(view, names).map((group) => group.windowName)).toEqual(['Research', 'Work']);
  });
});

function windowView({ groupId, id }: { groupId: number; id: number }): WindowView {
  return {
    focused: false,
    groupSpans: [
      {
        color: 'blue',
        endIndex: 0,
        groupId,
        startIndex: 0,
        tabCount: 1,
        tabIds: [id * 10],
        title: `Group ${groupId}`,
        windowId: id
      }
    ],
    id,
    items: [
      {
        group: {
          collapsed: false,
          color: 'blue',
          id: groupId,
          title: `Group ${groupId}`,
          windowId: id
        },
        kind: 'tab',
        tab: {
          active: false,
          audible: false,
          groupId,
          id: id * 10,
          index: 0,
          pinned: false,
          title: `Tab ${id}`,
          windowId: id
        }
      }
    ],
    type: 'normal'
  };
}
