import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs/modular/sortable.complete.esm.js';

import type { NativeTabId, NativeWindowId } from '../../domain/types';
import { debugDrag } from '../debugLog';
import {
  captureSortableRootDomOrder,
  readSortableWindowStatesFromDocument,
  restoreSortableRootDomOrder,
  type SortableRootDomOrder
} from '../view/sortableDomState';
import type { SortableWindowState } from '../view/sortableWindow';

export interface UseSortableWindowListsOptions {
  collapsedWindow: boolean;
  dragEnabled: boolean;
  onSortableChange: (states: SortableWindowState[]) => void;
  onSortableStart: () => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
  selectedTabIds: ReadonlySet<NativeTabId>;
  windowId: NativeWindowId;
}

export function useSortableWindowLists({
  collapsedWindow,
  dragEnabled,
  onSortableChange,
  onSortableStart,
  rootRef,
  selectedTabIds,
  windowId
}: UseSortableWindowListsOptions) {
  const onSortableChangeRef = useRef(onSortableChange);
  const onSortableStartRef = useRef(onSortableStart);
  const sortableRootDomOrderRef = useRef<SortableRootDomOrder | undefined>(undefined);
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
    const handlePointerDown = (event: PointerEvent) => prepareGroupDragRepresentativeFromEvent(event);
    const handleMouseDown = (event: MouseEvent) => prepareGroupDragRepresentativeFromEvent(event);
    const handleEnd = () => {
      debugDrag('sortable onEnd read states', { windowId });
      const states = readSortableWindowStates();
      restoreSortableRootDomOrder(sortableRootDomOrderRef.current);
      sortableRootDomOrderRef.current = undefined;
      onSortableChangeRef.current(states);
      window.requestAnimationFrame(cleanupSortableArtifacts);
    };

    debugDrag('sortable effect create', {
      collapsedWindow,
      dragEnabled,
      selectedCount: selectedTabIdsRef.current.size,
      windowId
    });
    root.addEventListener('pointerdown', handlePointerDown, { capture: true });
    root.addEventListener('mousedown', handleMouseDown, { capture: true });
    sortables.push(
      createSortable(root, true, () => {
        sortableRootDomOrderRef.current = captureSortableRootDomOrder(document);
        onSortableStartRef.current();
      }, handleEnd)
    );
    root.querySelectorAll<HTMLElement>('.sortable-group-tabs').forEach((list) => {
      sortables.push(
        createSortable(list, false, () => {
          sortableRootDomOrderRef.current = captureSortableRootDomOrder(document);
          onSortableStartRef.current();
        }, handleEnd)
      );
    });
    syncSortableSelection(root, selectedTabIds);

    return () => {
      debugDrag('sortable effect cleanup', {
        collapsedWindow,
        dragEnabled,
        selectedCount: selectedTabIdsRef.current.size,
        windowId
      });
      root.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      root.removeEventListener('mousedown', handleMouseDown, { capture: true });
      sortables.forEach((sortable) => sortable.destroy());
      restoreSortableRootDomOrder(sortableRootDomOrderRef.current);
      sortableRootDomOrderRef.current = undefined;
      cleanupSortableArtifacts();
    };
  }, [collapsedWindow, dragEnabled, rootRef, windowId]);

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
    handle: isRoot ? '.sortable-root-tab-item .tab-row, .sortable-group-block > .group-rail-item .group-label' : '.tab-row',
    multiDrag: true,
    onEnd,
    onMove: (event: { dragged: HTMLElement; related?: HTMLElement | null; to: HTMLElement }) =>
      isRoot || moveTabInsideSortableList(event),
    onStart: () => {
      onStart();
    },
    removeCloneOnHide: true,
    selectedClass: 'is-selected'
  });
}

function moveTabInsideSortableList(event: { dragged: HTMLElement; related?: HTMLElement | null; to: HTMLElement }) {
  if (event.dragged.dataset.sortableKind !== 'tab') {
    return false;
  }

  applyDropGroupOverride(event.dragged, dropGroupIdFromMoveTarget(event.to, event.related));
  return true;
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

  document.querySelectorAll<HTMLElement>('[data-whole-group-drag]').forEach((element) => {
    delete element.dataset.wholeGroupDrag;
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

function dropGroupIdFromMoveTarget(container: HTMLElement | null | undefined, related: HTMLElement | null | undefined) {
  const target = container?.classList.contains('sortable-group-tabs') ? container : related;

  if (!target) {
    return undefined;
  }

  const groupId = Number(target.dataset.groupId);
  return Number.isFinite(groupId) ? groupId : undefined;
}

function prepareGroupDragRepresentativeFromEvent(event: Event) {
  const target = event.target instanceof Element ? event.target : undefined;

  if (!target?.closest('.group-label')) {
    return;
  }

  const item = target.closest<HTMLElement>('.sortable-root-item[data-group-id]');
  const groupId = Number(item?.dataset.groupId);

  if (!Number.isFinite(groupId)) {
    return;
  }

  if (item) {
    item.dataset.wholeGroupDrag = 'true';
  }
}
