import { useCallback, useEffect, useRef } from 'react';

import type { BrowserSnapshotView } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { reconcileSortableProjection } from '../application/sortableActions';
import { debugDrag } from '../debugLog';
import type { BrowserSnapshotRefreshReason } from './useBrowserSnapshot';
import {
  beginSortableDragSync,
  browserSyncSignal,
  completeSortableDragSync,
  finishSortableCommitSync,
  initialSortableDragSyncState,
  resolveBrowserSnapshotSync,
  sameBrowserViewLayout,
  sortableCommitIsCurrent,
  type SortableDragSyncState
} from '../view/browserSync';
import { projectSortableWindowsInView, type SortableWindowState } from '../view/sortableWindow';

export interface UseSortableDragSyncOptions {
  api: BrowserTabsApi | undefined;
  onCommitSuccess: () => void;
  refresh: (options?: { reason?: BrowserSnapshotRefreshReason }) => Promise<BrowserSnapshotView | undefined> | undefined;
  setSnapshotView: React.Dispatch<React.SetStateAction<BrowserSnapshotView>>;
  setSortableRenderVersion: React.Dispatch<React.SetStateAction<number>>;
  snapshotView: BrowserSnapshotView;
}

export function useSortableDragSync({
  api,
  onCommitSuccess,
  refresh,
  setSnapshotView,
  setSortableRenderVersion,
  snapshotView
}: UseSortableDragSyncOptions) {
  const latestSnapshotViewRef = useRef<BrowserSnapshotView>({ windows: [] });
  const sortableDragSyncRef = useRef(initialSortableDragSyncState());

  useEffect(() => {
    latestSnapshotViewRef.current = snapshotView;
  }, [snapshotView]);

  const shouldApplyBrowserSnapshot = useCallback((nextView: BrowserSnapshotView, reason: BrowserSnapshotRefreshReason) => {
    if (reason !== 'browser-sync') {
      sortableDragSyncRef.current = finishSortableCommitSync(sortableDragSyncRef.current);
      return true;
    }

    const currentView = latestSnapshotViewRef.current;
    const dragSync = sortableDragSyncRef.current;
    const resolution = resolveBrowserSnapshotSync({
      currentView,
      dragging: dragSync.phase === 'dragging',
      expectedView: dragSync.expectedView,
      nextView
    });
    const layoutChanged = !sameBrowserViewLayout(currentView, nextView);
    debugDrag('browser snapshot decision', {
      layoutChanged,
      phase: dragSync.phase,
      pendingBrowserSync: dragSync.pendingBrowserSync,
      reason,
      resolution,
      sessionId: dragSync.sessionId
    });

    if (resolution.action === 'defer') {
      sortableDragSyncRef.current = { ...dragSync, pendingBrowserSync: true };
      return false;
    }

    if (resolution.action === 'apply' || resolution.clearExpectedView) {
      sortableDragSyncRef.current = finishSortableCommitSync(dragSync);
    }

    if (resolution.action === 'apply' && layoutChanged) {
      setSortableRenderVersion((version) => version + 1);
    }

    return resolution.action === 'apply';
  }, [setSortableRenderVersion]);

  const shouldDeferBrowserSync = useCallback(() => {
    const before = sortableDragSyncRef.current;
    const result = browserSyncSignal(sortableDragSyncRef.current);
    sortableDragSyncRef.current = result.state;
    debugDrag('browser sync signal', {
      before,
      shouldRefresh: result.shouldRefresh,
      state: result.state
    });
    return !result.shouldRefresh;
  }, []);

  const handleSortableStart = useCallback(() => {
    const before = sortableDragSyncRef.current;
    sortableDragSyncRef.current = beginSortableDragSync(sortableDragSyncRef.current);
    debugDrag('sortable start', {
      before,
      state: sortableDragSyncRef.current
    });
  }, []);

  const handleSortableWindowChange = useCallback(
    (states: SortableWindowState[]) => {
      handleSortableChange(api, latestSnapshotViewRef.current, states, {
        refresh,
        setSnapshotView,
        setSortableRenderVersion,
        sortableDragSyncRef
      }, onCommitSuccess);
    },
    [api, onCommitSuccess, refresh, setSnapshotView, setSortableRenderVersion]
  );

  return {
    handleSortableStart,
    handleSortableWindowChange,
    shouldApplyBrowserSnapshot,
    shouldDeferBrowserSync
  };
}

function handleSortableChange(
  api: BrowserTabsApi | undefined,
  view: BrowserSnapshotView,
  states: SortableWindowState[],
  sync: {
    refresh: (options?: { reason?: BrowserSnapshotRefreshReason }) => Promise<BrowserSnapshotView | undefined> | undefined;
    setSnapshotView: React.Dispatch<React.SetStateAction<BrowserSnapshotView>>;
    setSortableRenderVersion: React.Dispatch<React.SetStateAction<number>>;
    sortableDragSyncRef: React.MutableRefObject<SortableDragSyncState>;
  },
  onSuccess: () => void
) {
  if (!api || states.length === 0) {
    refreshPendingBrowserSync(sync);
    return;
  }

  const projectedView = projectSortableWindowsInView(view, states);
  if (sameBrowserViewLayout(view, projectedView)) {
    debugDrag('sortable no-op', {
      state: sync.sortableDragSyncRef.current,
      projectedWindows: projectedView.windows.map((window) => ({
        tabIds: window.items.map((item) => item.tab.id),
        windowId: window.id
      }))
    });
    sync.sortableDragSyncRef.current = finishSortableCommitSync(sync.sortableDragSyncRef.current);
    refreshPendingBrowserSync(sync);
    return;
  }

  const dragResult = completeSortableDragSync(sync.sortableDragSyncRef.current, projectedView);
  debugDrag('sortable end', {
    dragResult,
    projectedWindows: projectedView.windows.map((window) => ({
      tabIds: window.items.map((item) => item.tab.id),
      windowId: window.id
    }))
  });
  sync.sortableDragSyncRef.current = dragResult.state;
  const commitSessionId = dragResult.state.sessionId;
  sync.setSnapshotView(projectedView);
  reconcileSortableProjection(api, view, projectedView)
    .then(() => {
      if (!sortableCommitIsCurrent(sync.sortableDragSyncRef.current, commitSessionId)) {
        debugDrag('stale sortable reconcile ignored', {
          commitSessionId,
          state: sync.sortableDragSyncRef.current
        });
        sync.sortableDragSyncRef.current = { ...sync.sortableDragSyncRef.current, pendingBrowserSync: true };
        return;
      }

      debugDrag('sortable reconcile succeeded', { commitSessionId, state: sync.sortableDragSyncRef.current });
      onSuccess();
      refreshBrowserSync(sync);
    })
    .catch(() => {
      if (!sortableCommitIsCurrent(sync.sortableDragSyncRef.current, commitSessionId)) {
        debugDrag('stale sortable reconcile failure ignored', {
          commitSessionId,
          state: sync.sortableDragSyncRef.current
        });
        sync.sortableDragSyncRef.current = { ...sync.sortableDragSyncRef.current, pendingBrowserSync: true };
        return;
      }

      debugDrag('sortable reconcile failed', { commitSessionId, state: sync.sortableDragSyncRef.current });
      sync.sortableDragSyncRef.current = finishSortableCommitSync(sync.sortableDragSyncRef.current);
      sync.setSortableRenderVersion((version) => version + 1);
      sync.setSnapshotView(view);
      refreshBrowserSnapshot(sync, 'manual');
      window.alert('Unable to move tabs.');
    });
}

function refreshPendingBrowserSync(sync: {
  refresh: (options?: { reason?: BrowserSnapshotRefreshReason }) => Promise<BrowserSnapshotView | undefined> | undefined;
  sortableDragSyncRef: React.MutableRefObject<SortableDragSyncState>;
}) {
  if (sync.sortableDragSyncRef.current.pendingBrowserSync) {
    debugDrag('pending browser sync refresh after sortable end', { state: sync.sortableDragSyncRef.current });
    refreshBrowserSync(sync);
    return;
  }

  debugDrag('sortable end without pending browser sync', { state: sync.sortableDragSyncRef.current });
  sync.sortableDragSyncRef.current = finishSortableCommitSync(sync.sortableDragSyncRef.current);
}

function refreshBrowserSync(sync: {
  refresh: (options?: { reason?: BrowserSnapshotRefreshReason }) => Promise<BrowserSnapshotView | undefined> | undefined;
  sortableDragSyncRef: React.MutableRefObject<SortableDragSyncState>;
}) {
  refreshBrowserSnapshot(sync, 'browser-sync');
}

function refreshBrowserSnapshot(
  sync: {
    refresh: (options?: { reason?: BrowserSnapshotRefreshReason }) => Promise<BrowserSnapshotView | undefined> | undefined;
    sortableDragSyncRef: React.MutableRefObject<SortableDragSyncState>;
  },
  reason: BrowserSnapshotRefreshReason
) {
  debugDrag('refresh browser snapshot', { reason, state: sync.sortableDragSyncRef.current });
  sync.sortableDragSyncRef.current = {
    ...sync.sortableDragSyncRef.current,
    pendingBrowserSync: false
  };
  sync.refresh({ reason });
}
