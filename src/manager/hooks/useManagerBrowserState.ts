import { useCallback, useRef } from 'react';

import type { BrowserSnapshotView, NativeTabId } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { useBrowserSnapshot, type BrowserSnapshotRefreshReason } from './useBrowserSnapshot';
import { useSortableDragSync } from './useSortableDragSync';

export interface UseManagerBrowserStateOptions {
  api: BrowserTabsApi | undefined;
  onBrowserStateChanged: () => void;
  onSortableCommitSuccess: () => void;
  runtimeAvailable: boolean;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
  setSortableRenderVersion: React.Dispatch<React.SetStateAction<number>>;
}

export function useManagerBrowserState({
  api,
  onBrowserStateChanged,
  onSortableCommitSuccess,
  runtimeAvailable,
  setSelectedTabIds,
  setSortableRenderVersion
}: UseManagerBrowserStateOptions) {
  const sortableDragSyncRef = useRef<ReturnType<typeof useSortableDragSync> | undefined>(undefined);
  const shouldApplyBrowserSnapshot = useCallback((nextView: BrowserSnapshotView, reason: BrowserSnapshotRefreshReason) => {
    return sortableDragSyncRef.current?.shouldApplyBrowserSnapshot(nextView, reason) ?? true;
  }, []);
  const shouldDeferBrowserSync = useCallback(() => {
    return sortableDragSyncRef.current?.shouldDeferBrowserSync() ?? false;
  }, []);
  const getBrowserViewPatchContext = useCallback(() => {
    return sortableDragSyncRef.current?.getBrowserViewPatchContext();
  }, []);
  const handleBrowserViewPatchApplied = useCallback((patch: Parameters<ReturnType<typeof useSortableDragSync>['handleBrowserViewPatchApplied']>[0]) => {
    sortableDragSyncRef.current?.handleBrowserViewPatchApplied(patch);
  }, []);
  const { refresh, setSnapshotView, snapshotView, status } = useBrowserSnapshot({
    api,
    getBrowserViewPatchContext,
    onBrowserViewPatchApplied: handleBrowserViewPatchApplied,
    runtimeAvailable,
    shouldApplyBrowserSnapshot,
    shouldDeferBrowserSync,
    setSelectedTabIds,
    onBrowserStateChanged
  });
  const sortableDragSync = useSortableDragSync({
    api,
    onCommitSuccess: onSortableCommitSuccess,
    refresh,
    setSnapshotView,
    setSortableRenderVersion,
    snapshotView
  });

  sortableDragSyncRef.current = sortableDragSync;

  return {
    refresh,
    setSnapshotView,
    snapshotView,
    sortableDragSync,
    status
  };
}
