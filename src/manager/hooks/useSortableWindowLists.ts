import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs/modular/sortable.complete.esm.js';

import type { NativeGroupId, NativeTabId, NativeWindowId } from '../../domain/types';
import { debugDrag } from '../debugLog';
import type { SortableWindowState } from '../view/sortableWindow';

export interface UseSortableWindowListsOptions {
  collapsedWindow: boolean;
  dragEnabled: boolean;
  onSortableChange: (states: SortableWindowState[]) => void;
  onSortableStart: () => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
  selectedTabIds: ReadonlySet<NativeTabId>;
  sortableStructureKey: string;
  windowId: NativeWindowId;
}

export function useSortableWindowLists({
  collapsedWindow,
  dragEnabled,
  onSortableChange,
  onSortableStart,
  rootRef,
  selectedTabIds,
  sortableStructureKey,
  windowId
}: UseSortableWindowListsOptions) {
  const onSortableChangeRef = useRef(onSortableChange);
  const onSortableStartRef = useRef(onSortableStart);
  const selectedTabIdsRef = useRef(selectedTabIds);

  useEffect(() => {
    onSortableChangeRef.current = onSortableChange;
  }, [onSortableChange]);

  useEffect(() => {
    onSortableStartRef.current = onSortableStart;
  }, [onSortableStart]);

  useEffect(() => {
    selectedTabIdsRef.current = selectedTabIds;
  }, [selectedTabIds]);

  useEffect(() => {
    const root = rootRef.current;

    if (!root || !dragEnabled || collapsedWindow) {
      return;
    }

    const sortables: Sortable[] = [];
    const handleEnd = () => {
      debugDrag('sortable onEnd read states', { windowId });
      onSortableChangeRef.current(readSortableWindowStates());
      window.requestAnimationFrame(cleanupSortableArtifacts);
    };

    debugDrag('sortable effect create', {
      collapsedWindow,
      dragEnabled,
      selectedCount: selectedTabIdsRef.current.size,
      windowId
    });
    sortables.push(createSortable(root, true, () => onSortableStartRef.current(), handleEnd));
    root.querySelectorAll<HTMLElement>('.sortable-group-tabs').forEach((list) => {
      sortables.push(createSortable(list, false, () => onSortableStartRef.current(), handleEnd));
    });
    syncSortableSelection(root, selectedTabIds);

    return () => {
      debugDrag('sortable effect cleanup', {
        collapsedWindow,
        dragEnabled,
        selectedCount: selectedTabIdsRef.current.size,
        windowId
      });
      cleanupSortableArtifacts();
      sortables.forEach((sortable) => sortable.destroy());
    };
  }, [collapsedWindow, dragEnabled, rootRef, sortableStructureKey, windowId]);

  useEffect(() => {
    const root = rootRef.current;

    if (root && dragEnabled && !collapsedWindow) {
      syncSortableSelection(root, selectedTabIds);
    }
  }, [collapsedWindow, dragEnabled, rootRef, selectedTabIds]);
}

function createSortable(element: HTMLElement, isRoot: boolean, onStart: () => void, onEnd: () => void) {
  return new Sortable(element, {
    animation: 150,
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    draggable: isRoot ? '.sortable-root-item' : '.sortable-tab-item',
    fallbackOnBody: true,
    fallbackClass: 'sortable-fallback',
    filter: '.no-drag',
    forceFallback: true,
    ghostClass: 'sortable-ghost',
    group: {
      name: 'tabs-and-groups',
      pull: true,
      put: (_to, _from, dragged) => isRoot || dragged.dataset.sortableKind === 'tab'
    },
    handle: isRoot ? '.tab-row, .group-label' : '.tab-row',
    multiDrag: true,
    onEnd,
    onStart,
    removeCloneOnHide: true,
    onMove: (event) => isRoot || event.dragged.dataset.sortableKind === 'tab',
    selectedClass: 'is-selected'
  });
}

function cleanupSortableArtifacts() {
  document
    .querySelectorAll<HTMLElement>('.sortable-window-root .sortable-ghost, .sortable-window-root .sortable-chosen, .sortable-window-root .sortable-drag')
    .forEach((element) => {
      element.classList.remove('sortable-ghost', 'sortable-chosen', 'sortable-drag');
    });

  document.querySelectorAll<HTMLElement>('.sortable-fallback').forEach((element) => {
    if (!element.closest('.sortable-window-root')) {
      element.remove();
    }
  });
}

function syncSortableSelection(root: HTMLElement, selectedTabIds: ReadonlySet<NativeTabId>) {
  root.querySelectorAll<HTMLElement>('.sortable-tab-item[data-tab-id]').forEach((element) => {
    const tabId = Number(element.dataset.tabId);

    if (selectedTabIds.has(tabId)) {
      Sortable.utils.select(element);
    } else {
      Sortable.utils.deselect(element);
    }
  });
}

function readSortableWindowStates(): SortableWindowState[] {
  return [...document.querySelectorAll<HTMLElement>('.sortable-window-root')].flatMap((root) => {
    const windowId = Number(root.dataset.windowId);

    if (!Number.isFinite(windowId)) {
      return [];
    }

    return [
      {
        windowId,
        items: [...root.children].flatMap((child) => sortableItemFromElement(child))
      }
    ];
  });
}

function sortableItemFromElement(element: Element): SortableWindowState['items'] {
  const item = element as HTMLElement;

  if (item.dataset.sortableKind === 'tab') {
    const tabId = Number(item.dataset.tabId);
    return Number.isFinite(tabId) ? [{ kind: 'tab', tabId }] : [];
  }

  if (item.dataset.sortableKind !== 'group') {
    return [];
  }

  const groupId = Number(item.dataset.groupId);
  const list = item.querySelector<HTMLElement>('.sortable-group-tabs');

  if (!Number.isFinite(groupId) || !list) {
    return [];
  }

  return [{ kind: 'group', groupId, tabIds: readGroupTabIds(list) }];
}

function readGroupTabIds(list: HTMLElement) {
  const tabIds: NativeTabId[] = [];

  for (const child of list.children) {
    const element = child as HTMLElement;

    if (element.dataset.sortableKind === 'tab') {
      const tabId = Number(element.dataset.tabId);

      if (Number.isFinite(tabId)) {
        tabIds.push(tabId);
      }
    }

    if (element.dataset.sortableKind === 'group-summary') {
      tabIds.push(...parseTabIds(element.dataset.tabIds));
    }
  }

  return [...new Set(tabIds)];
}

function parseTabIds(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((tabId) => Number(tabId))
    .filter((tabId) => Number.isFinite(tabId));
}
