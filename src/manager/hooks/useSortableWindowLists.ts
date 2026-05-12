import { useEffect, useRef } from 'react';
import Sortable from 'sortablejs/modular/sortable.complete.esm.js';

import type { BrowserTabGroupColor, NativeTabId, NativeWindowId } from '../../domain/types';
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
  sortableListKey: string;
  windowId: NativeWindowId;
}

export function useSortableWindowLists({
  collapsedWindow,
  dragEnabled,
  onSortableChange,
  onSortableStart,
  rootRef,
  selectedTabIds,
  sortableListKey,
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
  }, [collapsedWindow, dragEnabled, rootRef, sortableListKey, windowId]);

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
      moveSortableItem(event, isRoot),
    onStart: () => {
      onStart();
    },
    removeCloneOnHide: true,
    selectedClass: 'is-selected'
  });
}

function moveSortableItem(event: { dragged: HTMLElement; related?: HTMLElement | null; to: HTMLElement }, isRoot: boolean) {
  if (isRoot && event.dragged.dataset.sortableKind !== 'tab') {
    return true;
  }

  if (event.dragged.dataset.sortableKind !== 'tab') {
    return false;
  }

  const targetGroup = dropGroupFromMoveTarget(event.to, event.related);
  applyDropGroupOverride(event.dragged, targetGroup);
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

  document.querySelectorAll<HTMLElement>('.sortable-drop-preview').forEach((element) => {
    clearDropGroupPreview(element);
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

function applyDropGroupOverride(dragged: HTMLElement, targetGroup: DropGroupTarget | undefined) {
  const nextGroupId = targetGroup?.id ?? -1;
  const root = dragged.closest('.sortable-window-root');
  const selectedItems = root
    ? [...root.querySelectorAll<HTMLElement>('.sortable-tab-item.is-selected[data-sortable-kind="tab"]')]
    : [];
  const draggedItems = selectedItems.includes(dragged) ? selectedItems : [dragged];

  draggedItems.forEach((item) => {
    if (item.dataset.sortableKind === 'tab') {
      item.dataset.dropGroupId = String(nextGroupId);
      applyDropGroupPreview(item, targetGroup?.color);
    }
  });
}

interface DropGroupTarget {
  id: number;
  color?: BrowserTabGroupColor;
}

function dropGroupFromMoveTarget(
  container: HTMLElement | null | undefined,
  related: HTMLElement | null | undefined
): DropGroupTarget | undefined {
  if (container?.classList.contains('sortable-window-root')) {
    return undefined;
  }

  const target = container?.classList.contains('sortable-group-tabs') ? container : related;

  if (!target) {
    return undefined;
  }

  const groupId = Number(target.dataset.groupId);
  return Number.isFinite(groupId) ? { id: groupId, color: groupColorFromDataset(target.dataset.groupColor) } : undefined;
}

function applyDropGroupPreview(item: HTMLElement, color: BrowserTabGroupColor | undefined) {
  elementsForDraggedTab(item).forEach((element) => {
    element.classList.add('sortable-drop-preview');

    if (color) {
      element.style.setProperty('--drop-preview-group-color-rgb', `var(--group-${color}-rgb)`);
      return;
    }

    element.style.removeProperty('--drop-preview-group-color-rgb');
  });
}

function clearDropGroupPreview(element: HTMLElement) {
  element.classList.remove('sortable-drop-preview');
  element.style.removeProperty('--drop-preview-group-color-rgb');
}

function elementsForDraggedTab(item: HTMLElement) {
  const tabId = item.dataset.tabId;
  const elements = [item];

  if (tabId) {
    document
      .querySelectorAll<HTMLElement>(`.sortable-fallback[data-tab-id="${CSS.escape(tabId)}"], .sortable-drag[data-tab-id="${CSS.escape(tabId)}"]`)
      .forEach((element) => {
        if (!elements.includes(element)) {
          elements.push(element);
        }
      });
  }

  return elements;
}

function groupColorFromDataset(value: string | undefined): BrowserTabGroupColor | undefined {
  return isBrowserTabGroupColor(value) ? value : undefined;
}

function isBrowserTabGroupColor(value: string | undefined): value is BrowserTabGroupColor {
  return (
    value === 'grey' ||
    value === 'blue' ||
    value === 'red' ||
    value === 'yellow' ||
    value === 'green' ||
    value === 'pink' ||
    value === 'purple' ||
    value === 'cyan' ||
    value === 'orange'
  );
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
