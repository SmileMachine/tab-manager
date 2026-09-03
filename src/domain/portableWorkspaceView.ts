import type { PortableWorkspace } from '../codex/protocol';
import { createBrowserSnapshotView } from './snapshot';
import type { BrowserSnapshot, BrowserSnapshotView, BrowserTabGroupColor, NativeTabId } from './types';

export interface PortableWorkspaceView {
  view: BrowserSnapshotView;
  tabIdByLocalId: ReadonlyMap<string, NativeTabId>;
  tabLocalIdById: ReadonlyMap<NativeTabId, string>;
}

/**
 * Adapts persisted workspace data to the same view model used by the live
 * browser workspace. Synthetic negative ids keep snapshot rows usable by the
 * existing selection and collapse components without pretending they are
 * browser tab ids.
 */
export function createPortableWorkspaceView(workspace: PortableWorkspace): PortableWorkspaceView {
  const tabIdByLocalId = new Map<string, NativeTabId>();
  const tabLocalIdById = new Map<NativeTabId, string>();
  const snapshot: BrowserSnapshot = {
    windows: workspace.windows.map((window, windowIndex) => ({
      id: syntheticId('window', windowIndex),
      focused: workspace.activeWindowLocalId === window.localId,
      type: window.type,
      state: window.state,
      incognito: window.incognito
    })),
    tabs: [],
    groups: []
  };

  workspace.windows.forEach((window, windowIndex) => {
    const windowId = snapshot.windows[windowIndex].id;
    window.tabs.forEach((tab, tabIndex) => {
      const id = syntheticId('tab', tabIndex + workspace.windows.slice(0, windowIndex).reduce((count, item) => count + item.tabs.length, 0));
      tabIdByLocalId.set(tab.localId, id);
      tabLocalIdById.set(id, tab.localId);
      snapshot.tabs.push({
        id,
        windowId,
        index: tab.index,
        groupId: tab.groupLocalId ? syntheticGroupId(workspace, tab.groupLocalId) : -1,
        title: tab.title ?? tab.url ?? 'Untitled tab',
        url: tab.url,
        pendingUrl: tab.pendingUrl,
        pinned: tab.pinned,
        active: tab.active,
        audible: false,
        incognito: window.incognito
      });
    });

    window.groups.forEach((group) => {
      snapshot.groups.push({
        id: syntheticGroupId(workspace, group.localId),
        windowId,
        title: group.title,
        color: group.color as BrowserTabGroupColor,
        collapsed: group.collapsed,
        tabIds: group.tabLocalIds.flatMap((localId) => {
          const id = tabIdByLocalId.get(localId);
          return id === undefined ? [] : [id];
        })
      });
    });
  });

  return { view: createBrowserSnapshotView(snapshot), tabIdByLocalId, tabLocalIdById };
}

function syntheticId(kind: 'window' | 'tab', index: number): number {
  const base = kind === 'window' ? 1_000_000 : 2_000_000;
  return -(base + index + 1);
}

function syntheticGroupId(workspace: PortableWorkspace, localId: string): number {
  let index = 0;
  for (const window of workspace.windows) {
    for (const group of window.groups) {
      if (group.localId === localId) return -(3_000_000 + index + 1);
      index += 1;
    }
  }
  return -(3_000_000 + hash(localId));
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) % 900_000 + 1;
}
