import type { NativeGroupId, NativeTabId } from '../../domain/types';
import type { SortableWindowState } from './sortableWindow';

export interface SortableRootDomOrder {
  roots: Array<{
    children: HTMLElement[];
    root: HTMLElement;
  }>;
}

export function captureSortableRootDomOrder(documentRoot: Document = document): SortableRootDomOrder {
  return {
    roots: [...documentRoot.querySelectorAll<HTMLElement>('.sortable-window-root, .sortable-group-tabs')].map((root) => ({
      children: [...root.children].filter((child): child is HTMLElement => child instanceof HTMLElement),
      root
    }))
  };
}

export function restoreSortableRootDomOrder(order: SortableRootDomOrder | undefined) {
  order?.roots.forEach(({ children, root }) => {
    children.forEach((child) => {
      if (child.parentElement !== root || child !== root.lastElementChild) {
        root.appendChild(child);
      }
    });
  });
}

export function readSortableWindowStatesFromDocument(documentRoot: Document = document): SortableWindowState[] {
  const roots = [...documentRoot.querySelectorAll<HTMLElement>('.sortable-window-root')];
  const allWholeGroupMoveIds = new Set(roots.flatMap((root) => readWholeGroupMoveIds(root)));

  return roots.flatMap((root) => {
    const windowId = Number(root.dataset.windowId);

    if (!Number.isFinite(windowId)) {
      return [];
    }

    const wholeGroupMoveIds = readWholeGroupMoveIds(root);

    return [
      wholeGroupMoveIds.length > 0
        ? {
            windowId,
            items: readSortableItemsFromRoot(root, allWholeGroupMoveIds),
            wholeGroupMoveIds
          }
        : {
            windowId,
            items: readSortableItemsFromRoot(root, allWholeGroupMoveIds)
          }
    ];
  });
}

export function readSortableItemsFromRoot(
  root: HTMLElement,
  wholeGroupMoveIds: ReadonlySet<NativeGroupId> = new Set()
): SortableWindowState['items'] {
  const items: SortableWindowState['items'] = [];
  let pendingGroup: { groupId: NativeGroupId; tabIds: NativeTabId[] } | undefined;

  const flushPendingGroup = () => {
    if (!pendingGroup) {
      return;
    }

    items.push({
      kind: 'group',
      groupId: pendingGroup.groupId,
      tabIds: [...new Set(pendingGroup.tabIds)]
    });
    pendingGroup = undefined;
  };

  for (const child of root.children) {
    const sortableItem = sortableItemFromElement(child);

    if (!sortableItem) {
      continue;
    }

    if (sortableItem.kind === 'group-summary') {
      flushPendingGroup();
      items.push({
        kind: 'group',
        groupId: sortableItem.groupId,
        tabIds: [...new Set(sortableItem.tabIds)]
      });
      continue;
    }

    if (sortableItem.kind === 'group') {
      flushPendingGroup();
      items.push({
        kind: 'group',
        groupId: sortableItem.groupId,
        tabIds: [...new Set(sortableItem.tabIds)]
      });
      continue;
    }

    if (sortableItem.wholeGroupDrag && sortableItem.groupId !== undefined) {
      flushPendingGroup();
      items.push({
        kind: 'group',
        groupId: sortableItem.groupId,
        tabIds: sortableItem.groupTabIds
      });
      continue;
    }

    if (sortableItem.groupId === undefined) {
      flushPendingGroup();
      items.push({ kind: 'tab', tabId: sortableItem.tabId });
      continue;
    }

    const groupId = sortableItem.groupId;

    if (wholeGroupMoveIds.has(groupId)) {
      continue;
    }

    if (pendingGroup && pendingGroup.groupId !== groupId) {
      flushPendingGroup();
    }

    pendingGroup = pendingGroup ?? { groupId, tabIds: [] };
    pendingGroup.tabIds.push(sortableItem.tabId);
  }

  flushPendingGroup();
  return items;
}

type SortableDomItem =
  | {
      kind: 'tab';
      tabId: NativeTabId;
      groupId?: NativeGroupId;
      groupTabIds: NativeTabId[];
      wholeGroupDrag: boolean;
    }
  | { kind: 'group'; groupId: NativeGroupId; tabIds: NativeTabId[]; wholeGroupDrag: boolean }
  | { kind: 'group-summary'; groupId: NativeGroupId; tabIds: NativeTabId[] };

function sortableItemFromElement(element: Element): SortableDomItem | undefined {
  const item = element as HTMLElement;

  if (item.dataset.sortableKind === 'tab') {
    const tabId = Number(item.dataset.tabId);

    if (!Number.isFinite(tabId)) {
      return undefined;
    }

    const groupId = Number(item.dataset.dropGroupId ?? item.dataset.groupId);
    return Number.isFinite(groupId) && groupId !== -1
      ? {
          kind: 'tab',
          groupId,
          groupTabIds: parseTabIds(item.dataset.groupTabIds),
          tabId,
          wholeGroupDrag: item.dataset.wholeGroupDrag === 'true'
        }
      : { kind: 'tab', groupTabIds: [], tabId, wholeGroupDrag: false };
  }

  if (item.dataset.sortableKind === 'group-summary') {
    const groupId = Number(item.dataset.groupId);

    if (!Number.isFinite(groupId)) {
      return undefined;
    }

    return { kind: 'group-summary', groupId, tabIds: parseTabIds(item.dataset.tabIds) };
  }

  if (item.dataset.sortableKind === 'group') {
    const groupId = Number(item.dataset.groupId);

    if (!Number.isFinite(groupId)) {
      return undefined;
    }

    return {
      kind: 'group',
      groupId,
      tabIds: readGroupTabIds(item),
      wholeGroupDrag: item.dataset.wholeGroupDrag === 'true'
    };
  }

  return undefined;
}

function readGroupTabIds(item: HTMLElement) {
  const list = item.querySelector<HTMLElement>('.sortable-group-tabs');
  const projection = item.querySelector<HTMLElement>('.sortable-group-tabs-projection');
  const source = list && list.children.length > 0 ? list : projection;

  if (!source) {
    return [];
  }

  return [...source.querySelectorAll<HTMLElement>('[data-sortable-kind="tab"][data-tab-id]')]
    .map((element) => Number(element.dataset.tabId))
    .filter((tabId) => Number.isFinite(tabId));
}

function parseTabIds(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((tabId) => Number(tabId))
    .filter((tabId) => Number.isFinite(tabId));
}

function readWholeGroupMoveIds(root: HTMLElement) {
  return [
    ...new Set(
      [...root.querySelectorAll<HTMLElement>('[data-whole-group-drag][data-group-id]')]
        .map((element) => Number(element.dataset.groupId))
        .filter((groupId) => Number.isFinite(groupId))
    )
  ];
}
