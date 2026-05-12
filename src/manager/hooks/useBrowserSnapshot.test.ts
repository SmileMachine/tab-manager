import { describe, expect, it } from 'vitest';

import type { BrowserSnapshotView, WindowView } from '../../domain/types';
import { applyBrowserSnapshotViewUpdate } from './useBrowserSnapshot';

describe('applyBrowserSnapshotViewUpdate', () => {
  it('applies browser-sync snapshots through view patches', () => {
    const current = view([1, 2, 3]);
    const next = view([1, 2, 3], { 2: 'https://target.example/path' });
    const update = applyBrowserSnapshotViewUpdate(current, next, 'browser-sync');

    expect(update.patch).toEqual({ kind: 'content-update', tabIds: [2], view: next });
    expect(update.view.windows[0].items[0]).toBe(current.windows[0].items[0]);
    expect(update.view.windows[0].items[1]).not.toBe(current.windows[0].items[1]);
    expect(update.shouldReconcileSelection).toBe(false);
  });

  it('reconciles selection when browser-sync changes the tab id set', () => {
    const update = applyBrowserSnapshotViewUpdate(view([1, 2, 3]), view([1, 2, 4, 3]), 'browser-sync');

    expect(update.patch).toMatchObject({ kind: 'insert-tabs', tabIds: [4] });
    expect(update.shouldReconcileSelection).toBe(true);
  });

  it('confirms optimistic browser-sync snapshots without replacing the current view', () => {
    const current = view([2, 1, 3]);
    const next = view([2, 1, 3]);
    const update = applyBrowserSnapshotViewUpdate(current, next, 'browser-sync', {
      expectedView: next,
      operationId: 'sortable-1'
    });

    expect(update).toEqual({
      patch: { kind: 'confirm-optimistic', operationId: 'sortable-1' },
      shouldReconcileSelection: false,
      view: current
    });
  });

  it('applies content patches when an optimistic browser-sync snapshot has matching layout and changed content', () => {
    const current = view([2, 1, 3]);
    const next = view([2, 1, 3], { 1: 'https://target.example/path' });
    const update = applyBrowserSnapshotViewUpdate(current, next, 'browser-sync', {
      expectedView: next,
      operationId: 'sortable-1'
    });

    expect(update.patch).toEqual({ kind: 'content-update', tabIds: [1], view: next });
    expect(update.view.windows[0].items[0]).toBe(current.windows[0].items[0]);
    expect(update.view.windows[0].items[1]).not.toBe(current.windows[0].items[1]);
    expect(update.shouldReconcileSelection).toBe(false);
  });

  it('keeps initial and manual refresh as full snapshot updates', () => {
    const current = view([]);
    const next = view([1, 2]);

    expect(applyBrowserSnapshotViewUpdate(current, next, 'initial')).toEqual({
      patch: { kind: 'replace', reason: 'initial', view: next },
      shouldReconcileSelection: true,
      view: next
    });
    expect(applyBrowserSnapshotViewUpdate(next, next, 'manual')).toEqual({
      patch: { kind: 'replace', reason: 'manual', view: next },
      shouldReconcileSelection: false,
      view: next
    });
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
        favIconUrl: undefined,
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
