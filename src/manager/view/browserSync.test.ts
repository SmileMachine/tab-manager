import { describe, expect, it } from 'vitest';

import type { BrowserSnapshotView, WindowView } from '../../domain/types';
import {
  beginSortableDragSync,
  browserSyncSignal,
  completeSortableDragSync,
  initialSortableDragSyncState,
  mergeBrowserViewContent,
  resolveBrowserSnapshotSync,
  sameBrowserViewContent,
  sortableCommitIsCurrent,
  sameBrowserViewLayout
} from './browserSync';

describe('sortable drag sync state', () => {
  it('starts a new drag session without carrying the previous expected view', () => {
    const state = beginSortableDragSync({
      expectedView: view([2, 1, 3]),
      pendingBrowserSync: true,
      phase: 'committing',
      sessionId: 4
    });

    expect(state).toEqual({
      expectedView: undefined,
      pendingBrowserSync: false,
      phase: 'dragging',
      sessionId: 5
    });
  });

  it('records browser sync while dragging without allowing a refresh', () => {
    const state = beginSortableDragSync(initialSortableDragSyncState());
    const result = browserSyncSignal(state);

    expect(result).toEqual({
      shouldRefresh: false,
      state: {
        expectedView: undefined,
        pendingBrowserSync: true,
        phase: 'dragging',
        sessionId: 1
      }
    });
  });

  it('allows one browser sync refresh after a drag with a pending signal ends', () => {
    const dragging = browserSyncSignal(beginSortableDragSync(initialSortableDragSyncState())).state;
    const result = completeSortableDragSync(dragging, view([2, 1, 3]));

    expect(result).toEqual({
      shouldRefresh: true,
      state: {
        expectedView: view([2, 1, 3]),
        pendingBrowserSync: false,
        phase: 'committing',
        sessionId: 1
      }
    });
  });

  it('treats an old commit as stale after a new drag starts', () => {
    const committing = completeSortableDragSync(beginSortableDragSync(initialSortableDragSyncState()), view([2, 1, 3])).state;
    const draggingAgain = beginSortableDragSync(committing);

    expect(sortableCommitIsCurrent(draggingAgain, committing.sessionId)).toBe(false);
  });

  it('treats a commit as current while the same session is still committing', () => {
    const committing = completeSortableDragSync(beginSortableDragSync(initialSortableDragSyncState()), view([2, 1, 3])).state;

    expect(sortableCommitIsCurrent(committing, committing.sessionId)).toBe(true);
  });
});

describe('resolveBrowserSnapshotSync', () => {
  it('recognizes equivalent layouts with the same tab order and group membership', () => {
    expect(sameBrowserViewLayout(view([1, 2, 3]), view([1, 2, 3]))).toBe(true);
  });

  it('recognizes changed layouts when tab order differs', () => {
    expect(sameBrowserViewLayout(view([1, 2, 3]), view([1, 3, 2]))).toBe(false);
  });

  it('recognizes changed content when a tab navigates without changing layout', () => {
    expect(sameBrowserViewContent(view([1, 2, 3]), view([1, 2, 3], { 2: 'https://target.example/path' }))).toBe(false);
  });

  it('applies a browser snapshot when tab content changes without layout changes', () => {
    expect(
      resolveBrowserSnapshotSync({
        currentView: view([1, 2, 3]),
        nextView: view([1, 2, 3], { 2: 'https://target.example/path' })
      })
    ).toEqual({
      action: 'apply',
      clearExpectedView: false
    });
  });

  it('skips an unchanged browser snapshot while a sortable drag is active', () => {
    expect(
      resolveBrowserSnapshotSync({
        currentView: view([1, 2, 3]),
        dragging: true,
        nextView: view([1, 2, 3])
      })
    ).toEqual({
      action: 'skip',
      clearExpectedView: false
    });
  });

  it('defers a browser snapshot while a sortable drag is active', () => {
    expect(
      resolveBrowserSnapshotSync({
        currentView: view([1, 2, 3]),
        dragging: true,
        nextView: view([1, 3, 2])
      })
    ).toEqual({
      action: 'defer',
      clearExpectedView: false
    });
  });

  it('skips a browser snapshot that matches the current optimistic layout', () => {
    expect(
      resolveBrowserSnapshotSync({
        currentView: view([1, 2, 3]),
        expectedView: view([1, 2, 3]),
        nextView: view([1, 2, 3])
      })
    ).toEqual({
      action: 'skip',
      clearExpectedView: true
    });
  });

  it('confirms and skips a browser snapshot that matches the expected sortable projection', () => {
    expect(
      resolveBrowserSnapshotSync({
        currentView: view([1, 2, 3]),
        expectedView: view([2, 1, 3]),
        nextView: view([2, 1, 3])
      })
    ).toEqual({
      action: 'skip',
      clearExpectedView: true
    });
  });

  it('applies a browser snapshot that differs from both current and expected layouts', () => {
    expect(
      resolveBrowserSnapshotSync({
        currentView: view([1, 2, 3]),
        expectedView: view([2, 1, 3]),
        nextView: view([1, 3, 2])
      })
    ).toEqual({
      action: 'apply',
      clearExpectedView: true
    });
  });
});

describe('mergeBrowserViewContent', () => {
  it('updates tab content without changing the surrounding window layout', () => {
    const current = view([1, 2, 3]);
    const next = view([1, 2, 3], { 2: 'https://target.example/path' });
    const merged = mergeBrowserViewContent(current, next);

    expect(merged.windows[0]).not.toBe(current.windows[0]);
    expect(merged.windows[0].items[0]).toBe(current.windows[0].items[0]);
    expect(merged.windows[0].items[1]).not.toBe(current.windows[0].items[1]);
    expect(merged.windows[0].items[1].tab.url).toBe('https://target.example/path');
    expect(merged.windows[0].items.map((item) => item.tab.id)).toEqual([1, 2, 3]);
  });

  it('returns the next view when the layout changes', () => {
    const next = view([1, 3, 2]);

    expect(mergeBrowserViewContent(view([1, 2, 3]), next)).toBe(next);
  });
});

function view(tabIds: number[], urls: Record<number, string> = {}): BrowserSnapshotView {
  const window: WindowView = {
    focused: true,
    groupSpans: [],
    id: 1,
    items: tabIds.map((tabId, index) => ({
      kind: 'tab',
      tab: {
        active: false,
        audible: false,
        groupId: -1,
        id: tabId,
        index,
        pinned: false,
        title: urls[tabId] ? `Updated ${tabId}` : `Tab ${tabId}`,
        url: urls[tabId] ?? `https://example.com/${tabId}`,
        windowId: 1
      }
    })),
    type: 'normal'
  };

  return { windows: [window] };
}
