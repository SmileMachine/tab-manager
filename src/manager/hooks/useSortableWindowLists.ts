import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs/modular/sortable.complete.esm.js';

import type { NativeTabId, NativeWindowId } from '../../domain/types';
import { debugDrag } from '../debugLog';
import { readSortableWindowStatesFromDocument } from '../view/sortableDomState';
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
    sortables.push(createSortable(root, () => onSortableStartRef.current(), handleEnd));
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

function createSortable(element: HTMLElement, onStart: () => void, onEnd: () => void) {
  return new Sortable(element, {
    animation: 150,
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    draggable: '.sortable-root-item',
    fallbackOnBody: true,
    fallbackClass: 'sortable-fallback',
    filter: '.no-drag',
    forceFallback: true,
    ghostClass: 'sortable-ghost',
    group: {
      name: 'tabs-and-groups',
      pull: true,
      put: true
    },
    handle: '.tab-row, .group-label',
    multiDrag: true,
    onEnd,
    onMove: (event: { dragged: HTMLElement; related?: HTMLElement | null }) => {
      applyDropGroupOverride(event.dragged, dropGroupIdFromMoveTarget(event.related));
      return true;
    },
    onStart: (event: { item: HTMLElement; originalEvent?: Event }) => {
      prepareGroupDragSelection(event.item, event.originalEvent);
      onStart();
    },
    removeCloneOnHide: true,
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

  document.querySelectorAll<HTMLElement>('[data-drop-group-id]').forEach((element) => {
    delete element.dataset.dropGroupId;
  });

  document.querySelectorAll<HTMLElement>('[data-group-drag-selected]').forEach((element) => {
    Sortable.utils.deselect(element);
    delete element.dataset.groupDragSelected;
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
  return readSortableWindowStatesFromDocument(document);
}

function applyDropGroupOverride(dragged: HTMLElement, groupId: number | undefined) {
  const nextGroupId = groupId ?? -1;
  const root = dragged.closest('.sortable-window-root');
  const selectedItems = root
    ? [...root.querySelectorAll<HTMLElement>('.sortable-tab-item.is-selected[data-sortable-kind="tab"]')]
    : [];
  const draggedItems = selectedItems.includes(dragged) ? selectedItems : [dragged];

  draggedItems.forEach((item) => {
    if (item.dataset.sortableKind === 'tab') {
      item.dataset.dropGroupId = String(nextGroupId);
    }
  });
}

function dropGroupIdFromMoveTarget(related: HTMLElement | null | undefined) {
  if (!related) {
    return undefined;
  }

  const groupId = Number(related.dataset.groupId);
  return Number.isFinite(groupId) ? groupId : undefined;
}

function prepareGroupDragSelection(item: HTMLElement, originalEvent: Event | undefined) {
  const target = originalEvent?.target instanceof Element ? originalEvent.target : undefined;

  if (!target?.closest('.group-label')) {
    return;
  }

  const groupId = Number(item.dataset.groupId);
  const root = item.closest('.sortable-window-root');

  if (!Number.isFinite(groupId) || !root) {
    return;
  }

  root.querySelectorAll<HTMLElement>(`.sortable-root-item[data-group-id="${groupId}"]`).forEach((element) => {
    Sortable.utils.select(element);
    element.dataset.groupDragSelected = 'true';
  });
}
