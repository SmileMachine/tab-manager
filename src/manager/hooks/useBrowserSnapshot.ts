import { useCallback, useEffect, useRef, useState } from 'react';

import { createBrowserSnapshotView } from '../../domain/snapshot';
import { reconcileSelection } from '../../domain/selection';
import type { BrowserSnapshotView, NativeTabId } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { debugDrag } from '../debugLog';
import {
  applyBrowserViewPatch,
  classifyBrowserViewPatch,
  type BrowserViewPatch
} from '../view/browserViewPatch';

export type ManagerStatus = 'loading' | 'ready' | 'unavailable' | 'error';
export type BrowserSnapshotRefreshReason = 'initial' | 'manual' | 'browser-sync';

interface RefreshOptions {
  reason?: BrowserSnapshotRefreshReason;
}

export function useBrowserSnapshot({
  api,
  onBrowserSnapshotApplied,
  onBrowserViewPatchApplied,
  onBrowserStateChanged,
  getBrowserViewPatchContext,
  runtimeAvailable,
  shouldApplyBrowserSnapshot,
  shouldDeferBrowserSync,
  setSelectedTabIds
}: {
  api: BrowserTabsApi | undefined;
  onBrowserSnapshotApplied?: (nextView: BrowserSnapshotView, reason: BrowserSnapshotRefreshReason) => void;
  onBrowserViewPatchApplied?: (patch: BrowserViewPatch) => void;
  onBrowserStateChanged: () => void;
  getBrowserViewPatchContext?: () => BrowserViewPatchContext | undefined;
  runtimeAvailable: boolean;
  shouldApplyBrowserSnapshot?: (nextView: BrowserSnapshotView, reason: BrowserSnapshotRefreshReason) => boolean;
  shouldDeferBrowserSync?: () => boolean;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
}) {
  const [snapshotView, setSnapshotView] = useState<BrowserSnapshotView>({ windows: [] });
  const [status, setStatus] = useState<ManagerStatus>('loading');
  const syncSignalCount = useRef(0);
  const syncTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback((options: RefreshOptions = {}) => {
    if (!api) {
      return undefined;
    }

    debugDrag('refresh requested', { reason: options.reason ?? 'manual' });
    return refreshSnapshot({
      api,
      getBrowserViewPatchContext,
      onBrowserSnapshotApplied,
      onBrowserViewPatchApplied,
      reason: options.reason ?? 'manual',
      setSelectedTabIds,
      setSnapshotView,
      setStatus,
      shouldApplyBrowserSnapshot
    });
  }, [api, getBrowserViewPatchContext, onBrowserSnapshotApplied, onBrowserViewPatchApplied, setSelectedTabIds, shouldApplyBrowserSnapshot]);

  useEffect(() => {
    if (!runtimeAvailable) {
      setStatus('unavailable');
      return;
    }

    refresh({ reason: 'initial' });
  }, [refresh, runtimeAvailable]);

  useEffect(() => {
    if (!api || !chrome.runtime?.onMessage) {
      return;
    }

    const listener = (message: unknown) => {
      if (!isBrowserStateChangedMessage(message)) {
        return;
      }

      onBrowserStateChanged();
      syncSignalCount.current += 1;
      if (shouldDeferBrowserSync?.()) {
        debugDrag('browser sync message deferred before timer', { coalescedSignals: syncSignalCount.current });
        syncSignalCount.current = 0;
        window.clearTimeout(syncTimer.current);
        return;
      }

      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        if (shouldDeferBrowserSync?.()) {
          debugDrag('browser sync timer deferred', { coalescedSignals: syncSignalCount.current });
          syncSignalCount.current = 0;
          return;
        }

        debugDrag('browser sync timer elapsed', { coalescedSignals: syncSignalCount.current });
        syncSignalCount.current = 0;
        refresh({ reason: 'browser-sync' });
      }, 180);
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      window.clearTimeout(syncTimer.current);
    };
  }, [api, onBrowserStateChanged, refresh, shouldDeferBrowserSync]);

  return { refresh, setSnapshotView, snapshotView, status };
}

function refreshSnapshot({
  api,
  getBrowserViewPatchContext,
  onBrowserSnapshotApplied,
  onBrowserViewPatchApplied,
  reason,
  setSelectedTabIds,
  setSnapshotView,
  setStatus,
  shouldApplyBrowserSnapshot
}: {
  api: BrowserTabsApi;
  getBrowserViewPatchContext?: () => BrowserViewPatchContext | undefined;
  onBrowserSnapshotApplied?: (nextView: BrowserSnapshotView, reason: BrowserSnapshotRefreshReason) => void;
  onBrowserViewPatchApplied?: (patch: BrowserViewPatch) => void;
  reason: BrowserSnapshotRefreshReason;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
  setSnapshotView: React.Dispatch<React.SetStateAction<BrowserSnapshotView>>;
  setStatus: React.Dispatch<React.SetStateAction<ManagerStatus>>;
  shouldApplyBrowserSnapshot?: (nextView: BrowserSnapshotView, reason: BrowserSnapshotRefreshReason) => boolean;
}) {
  return api
    .loadSnapshot()
    .then((snapshot) => {
      const nextView = createBrowserSnapshotView(snapshot);
      const applySnapshot = shouldApplyBrowserSnapshot?.(nextView, reason) ?? true;
      debugDrag('snapshot loaded', {
        applySnapshot,
        reason,
        tabCount: tabIdsFromView(nextView).length,
        windowCount: nextView.windows.length
      });

      if (!applySnapshot) {
        setStatus('ready');
        return nextView;
      }

      setSnapshotView((currentView) => {
        const update = applyBrowserSnapshotViewUpdate(currentView, nextView, reason, getBrowserViewPatchContext?.());
        debugDrag('browser snapshot patch', browserViewPatchDebugData(update.patch, update.shouldReconcileSelection));

        if (update.shouldReconcileSelection) {
          setSelectedTabIds((current) => reconcileSelection(current, tabIdsFromView(nextView)));
        }

        onBrowserViewPatchApplied?.(update.patch);
        return update.view;
      });
      setStatus('ready');
      onBrowserSnapshotApplied?.(nextView, reason);
      return nextView;
    })
    .catch(() => {
      setStatus('error');
      return undefined;
    });
}

export function applyBrowserSnapshotViewUpdate(
  currentView: BrowserSnapshotView,
  nextView: BrowserSnapshotView,
  reason: BrowserSnapshotRefreshReason,
  patchContext?: BrowserViewPatchContext
): {
  patch: BrowserViewPatch;
  shouldReconcileSelection: boolean;
  view: BrowserSnapshotView;
} {
  const patch: BrowserViewPatch =
    reason === 'browser-sync'
      ? classifyBrowserViewPatch({
          currentView,
          expectedView: patchContext?.expectedView,
          nextView,
          operationId: patchContext?.operationId
        })
      : { kind: 'replace', reason, view: nextView };

  return {
    patch,
    shouldReconcileSelection: !sameTabIdSet(currentView, nextView),
    view: reason === 'browser-sync' ? applyBrowserViewPatch(currentView, patch) : nextView
  };
}

export interface BrowserViewPatchContext {
  expectedView?: BrowserSnapshotView;
  operationId?: string;
}

function tabIdsFromView(view: BrowserSnapshotView) {
  return view.windows.flatMap((window) => window.items.map((item) => item.tab.id));
}

function sameTabIdSet(left: BrowserSnapshotView, right: BrowserSnapshotView) {
  const leftTabIds = new Set(tabIdsFromView(left));
  const rightTabIds = new Set(tabIdsFromView(right));

  if (leftTabIds.size !== rightTabIds.size) {
    return false;
  }

  return [...leftTabIds].every((tabId) => rightTabIds.has(tabId));
}

function browserViewPatchDebugData(patch: BrowserViewPatch, shouldReconcileSelection: boolean) {
  return {
    groupCount: 'groupIds' in patch ? patch.groupIds.length : 0,
    kind: patch.kind,
    replaceReason: patch.kind === 'replace' ? patch.reason : undefined,
    shouldReconcileSelection,
    tabCount: 'tabIds' in patch ? patch.tabIds.length : 0,
    windowCount: 'windowIds' in patch ? patch.windowIds.length : 0
  };
}

function isBrowserStateChangedMessage(message: unknown): message is { type: 'browser-state-changed' } {
  return typeof message === 'object' && message !== null && 'type' in message && message.type === 'browser-state-changed';
}
