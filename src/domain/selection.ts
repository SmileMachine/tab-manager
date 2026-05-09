import type { NativeTabId } from './types';

export type GroupSelectionState = 'unchecked' | 'mixed' | 'checked';

export function toggleTabSelection(selection: ReadonlySet<NativeTabId>, tabId: NativeTabId) {
  const next = new Set(selection);

  if (next.has(tabId)) {
    next.delete(tabId);
  } else {
    next.add(tabId);
  }

  return next;
}

export function setGroupSelection(
  selection: ReadonlySet<NativeTabId>,
  tabIds: NativeTabId[],
  selected: boolean
) {
  const next = new Set(selection);

  for (const tabId of tabIds) {
    if (selected) {
      next.add(tabId);
    } else {
      next.delete(tabId);
    }
  }

  return next;
}

export function selectionStateForGroup(selection: ReadonlySet<NativeTabId>, tabIds: NativeTabId[]): GroupSelectionState {
  const selectedCount = tabIds.filter((tabId) => selection.has(tabId)).length;

  if (selectedCount === 0) {
    return 'unchecked';
  }

  return selectedCount === tabIds.length ? 'checked' : 'mixed';
}

export function reconcileSelection(selection: ReadonlySet<NativeTabId>, existingTabIds: NativeTabId[]) {
  const existing = new Set(existingTabIds);
  return new Set([...selection].filter((tabId) => existing.has(tabId)));
}
