import { useCallback, useEffect, useRef, useState } from 'react';

import { createBrowserSnapshotView } from '../../domain/snapshot';
import { reconcileSelection } from '../../domain/selection';
import type { BrowserSnapshotView, NativeTabId } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';

export type ManagerStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export function useBrowserSnapshot({
  api,
  onBrowserStateChanged,
  runtimeAvailable,
  setSelectedTabIds
}: {
  api: BrowserTabsApi | undefined;
  onBrowserStateChanged: () => void;
  runtimeAvailable: boolean;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
}) {
  const [snapshotView, setSnapshotView] = useState<BrowserSnapshotView>({ windows: [] });
  const [status, setStatus] = useState<ManagerStatus>('loading');
  const syncTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(() => {
    if (!api) {
      return undefined;
    }

    return refreshSnapshot(setSnapshotView, setSelectedTabIds, setStatus, api);
  }, [api, setSelectedTabIds]);

  useEffect(() => {
    if (!runtimeAvailable) {
      setStatus('unavailable');
      return;
    }

    refresh();
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
      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(refresh, 180);
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      window.clearTimeout(syncTimer.current);
    };
  }, [api, onBrowserStateChanged, refresh]);

  return { refresh, setSnapshotView, snapshotView, status };
}

function refreshSnapshot(
  setSnapshotView: React.Dispatch<React.SetStateAction<BrowserSnapshotView>>,
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>,
  setStatus: React.Dispatch<React.SetStateAction<ManagerStatus>>,
  api: BrowserTabsApi
) {
  return api
    .loadSnapshot()
    .then((snapshot) => {
      const nextView = createBrowserSnapshotView(snapshot);
      setSnapshotView(nextView);
      setSelectedTabIds((current) => reconcileSelection(current, tabIdsFromView(nextView)));
      setStatus('ready');
      return nextView;
    })
    .catch(() => {
      setStatus('error');
      return undefined;
    });
}

function tabIdsFromView(view: BrowserSnapshotView) {
  return view.windows.flatMap((window) => window.items.map((item) => item.tab.id));
}

function isBrowserStateChangedMessage(message: unknown): message is { type: 'browser-state-changed' } {
  return typeof message === 'object' && message !== null && 'type' in message && message.type === 'browser-state-changed';
}
