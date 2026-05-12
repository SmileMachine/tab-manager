import type { NativeGroupId, NativeTabId } from '../../domain/types';
import type { SortableWindowState } from './sortableWindow';

export function readSortableWindowStatesFromDocument(documentRoot: Document = document): SortableWindowState[] {
  return [...documentRoot.querySelectorAll<HTMLElement>('.sortable-window-root')].flatMap((root) => {
    const windowId = Number(root.dataset.windowId);

    if (!Number.isFinite(windowId)) {
      return [];
    }

    return [
      {
        windowId,
        items: readSortableItemsFromRoot(root)
      }
    ];
  });
}

export function readSortableItemsFromRoot(root: HTMLElement): SortableWindowState['items'] {
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

    if (sortableItem.groupId === undefined) {
      flushPendingGroup();
      items.push({ kind: 'tab', tabId: sortableItem.tabId });
      continue;
    }

    if (pendingGroup && pendingGroup.groupId !== sortableItem.groupId) {
      flushPendingGroup();
    }

    pendingGroup = pendingGroup ?? { groupId: sortableItem.groupId, tabIds: [] };
    pendingGroup.tabIds.push(sortableItem.tabId);
  }

  flushPendingGroup();
  return items;
}

type SortableDomItem =
  | { kind: 'tab'; tabId: NativeTabId; groupId?: NativeGroupId }
  | { kind: 'group-summary'; groupId: NativeGroupId; tabIds: NativeTabId[] };

function sortableItemFromElement(element: Element): SortableDomItem | undefined {
  const item = element as HTMLElement;

  if (item.dataset.sortableKind === 'tab') {
    const tabId = Number(item.dataset.tabId);

    if (!Number.isFinite(tabId)) {
      return undefined;
    }

    const groupId = Number(item.dataset.dropGroupId ?? item.dataset.groupId);
    return Number.isFinite(groupId) && groupId !== -1 ? { kind: 'tab', tabId, groupId } : { kind: 'tab', tabId };
  }

  if (item.dataset.sortableKind === 'group-summary') {
    const groupId = Number(item.dataset.groupId);

    if (!Number.isFinite(groupId)) {
      return undefined;
    }

    return { kind: 'group-summary', groupId, tabIds: parseTabIds(item.dataset.tabIds) };
  }

  return undefined;
}

function parseTabIds(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((tabId) => Number(tabId))
    .filter((tabId) => Number.isFinite(tabId));
}
