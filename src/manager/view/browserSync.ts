import type { BrowserSnapshotView, WindowView } from '../../domain/types';

export interface SortableDragSyncState {
  expectedView?: BrowserSnapshotView;
  operationId?: string;
  pendingBrowserSync: boolean;
  phase: 'idle' | 'dragging' | 'committing';
  sessionId: number;
}

export function initialSortableDragSyncState(): SortableDragSyncState {
  return {
    expectedView: undefined,
    operationId: undefined,
    pendingBrowserSync: false,
    phase: 'idle',
    sessionId: 0
  };
}

export function beginSortableDragSync(state: SortableDragSyncState): SortableDragSyncState {
  return {
    expectedView: undefined,
    operationId: undefined,
    pendingBrowserSync: false,
    phase: 'dragging',
    sessionId: state.sessionId + 1
  };
}

export function browserSyncSignal(state: SortableDragSyncState): {
  shouldRefresh: boolean;
  state: SortableDragSyncState;
} {
  if (state.phase === 'dragging' || state.phase === 'committing') {
    return {
      shouldRefresh: false,
      state: { ...state, pendingBrowserSync: true }
    };
  }

  return {
    shouldRefresh: true,
    state
  };
}

export function completeSortableDragSync(
  state: SortableDragSyncState,
  expectedView: BrowserSnapshotView
): {
  shouldRefresh: boolean;
  state: SortableDragSyncState;
} {
  return {
    shouldRefresh: state.pendingBrowserSync,
    state: {
      expectedView,
      operationId: `sortable-${state.sessionId}`,
      pendingBrowserSync: false,
      phase: 'committing',
      sessionId: state.sessionId
    }
  };
}

export function finishSortableCommitSync(state: SortableDragSyncState): SortableDragSyncState {
  return {
    expectedView: undefined,
    operationId: undefined,
    pendingBrowserSync: false,
    phase: 'idle',
    sessionId: state.sessionId
  };
}

export function sortableCommitIsCurrent(state: SortableDragSyncState, sessionId: number) {
  return state.phase === 'committing' && state.sessionId === sessionId;
}

export interface BrowserSnapshotSyncInput {
  currentView: BrowserSnapshotView;
  dragging?: boolean;
  expectedView?: BrowserSnapshotView;
  nextView: BrowserSnapshotView;
}

export interface BrowserSnapshotSyncResolution {
  action: 'apply' | 'defer' | 'skip';
  clearExpectedView: boolean;
}

export function resolveBrowserSnapshotSync({
  currentView,
  dragging = false,
  expectedView,
  nextView
}: BrowserSnapshotSyncInput): BrowserSnapshotSyncResolution {
  const matchesExpectedView = Boolean(expectedView && sameBrowserViewLayout(expectedView, nextView));
  const sameCurrentLayout = sameBrowserViewLayout(currentView, nextView);
  const sameCurrentContent = sameBrowserViewContent(currentView, nextView);

  if (sameCurrentLayout && sameCurrentContent) {
    return { action: 'skip', clearExpectedView: matchesExpectedView };
  }

  if (matchesExpectedView) {
    return { action: 'skip', clearExpectedView: true };
  }

  if (dragging) {
    return { action: 'defer', clearExpectedView: false };
  }

  return { action: 'apply', clearExpectedView: Boolean(expectedView && !sameCurrentLayout) };
}

export function sameBrowserViewLayout(left: BrowserSnapshotView, right: BrowserSnapshotView) {
  return browserViewLayoutKey(left) === browserViewLayoutKey(right);
}

export function sameBrowserViewContent(left: BrowserSnapshotView, right: BrowserSnapshotView) {
  return browserViewContentKey(left) === browserViewContentKey(right);
}

export function mergeBrowserViewContent(currentView: BrowserSnapshotView, nextView: BrowserSnapshotView): BrowserSnapshotView {
  if (!sameBrowserViewLayout(currentView, nextView)) {
    return nextView;
  }

  return {
    windows: currentView.windows.map((currentWindow, windowIndex) =>
      mergeWindowContent(currentWindow, nextView.windows[windowIndex] ?? currentWindow)
    )
  };
}

function browserViewLayoutKey(view: BrowserSnapshotView) {
  return JSON.stringify(
    view.windows.map((window) => ({
      groups: window.groupSpans.map((group) => ({
        endIndex: group.endIndex,
        groupId: group.groupId,
        startIndex: group.startIndex,
        tabIds: group.tabIds,
        windowId: group.windowId
      })),
      tabs: window.items.map((item) => ({
        groupId: item.tab.groupId,
        id: item.tab.id,
        index: item.tab.index,
        windowId: item.tab.windowId
      })),
      windowId: window.id
    }))
  );
}

function browserViewContentKey(view: BrowserSnapshotView) {
  return JSON.stringify(
    view.windows.map((window) => ({
      tabs: window.items.map((item) => ({
        active: item.tab.active,
        audible: item.tab.audible,
        favIconUrl: item.tab.favIconUrl,
        id: item.tab.id,
        pinned: item.tab.pinned,
        title: item.tab.title,
        url: item.tab.url
      })),
      windowFocused: window.focused,
      windowId: window.id
    }))
  );
}

function mergeWindowContent(currentWindow: WindowView, nextWindow: WindowView): WindowView {
  const nextItemsById = new Map(nextWindow.items.map((item) => [item.tab.id, item]));
  let changed = currentWindow.focused !== nextWindow.focused || currentWindow.type !== nextWindow.type;
  const items = currentWindow.items.map((currentItem) => {
    const nextItem = nextItemsById.get(currentItem.tab.id);

    if (!nextItem || sameTabContent(currentItem, nextItem)) {
      return currentItem;
    }

    changed = true;
    return {
      ...currentItem,
      group: nextItem.group,
      tab: nextItem.tab
    };
  });

  return changed
    ? {
        ...currentWindow,
        focused: nextWindow.focused,
        items,
        type: nextWindow.type
      }
    : currentWindow;
}

function sameTabContent(left: WindowView['items'][number], right: WindowView['items'][number]) {
  return (
    left.group === right.group &&
    left.tab.active === right.tab.active &&
    left.tab.audible === right.tab.audible &&
    left.tab.favIconUrl === right.tab.favIconUrl &&
    left.tab.pinned === right.tab.pinned &&
    left.tab.title === right.tab.title &&
    left.tab.url === right.tab.url
  );
}
