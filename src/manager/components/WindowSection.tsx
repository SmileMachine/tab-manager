import { useEffect, useMemo, useRef } from 'react';
import Sortable from 'sortablejs/modular/sortable.complete.esm.js';

import { selectionStateForGroup, setGroupSelection } from '../../domain/selection';
import type {
  BrowserTabGroupColor,
  GroupSpan,
  NativeGroupId,
  NativeTabId,
  NativeWindowId,
  WindowView
} from '../../domain/types';
import { createWindowRows, type WindowRow } from '../../domain/windowRows';
import type { SortableWindowState } from '../view/sortableWindow';
import type { GroupEditMenuState } from './GroupEditPopover';
import { GroupLabel } from './GroupLabel';
import { TabListRow } from './TabListRow';
import { WindowTitle } from './WindowTitle';

export interface WindowSectionProps {
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  contextSourceTabId: NativeTabId | undefined;
  defaultWindowName: string;
  dragEnabled: boolean;
  index: number;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenGroupMenu: (state: GroupEditMenuState) => void;
  onOpenTabContextMenu: (event: React.MouseEvent, tabId: NativeTabId) => void;
  onSelectTab: (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => void;
  onSortableChange: (states: SortableWindowState[]) => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  onUpdateWindowName: (windowId: NativeWindowId, name: string) => void;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
  windowName: string | undefined;
  windowView: WindowView;
}

type RenderBlock =
  | { kind: 'tab'; row: Extract<WindowRow, { kind: 'tab' }> }
  | {
      kind: 'group';
      collapsed: boolean;
      group: GroupSpan;
      rows: WindowRow[];
    };

export function WindowSection({
  collapsedGroupIds,
  contextSourceTabId,
  defaultWindowName,
  dragEnabled,
  index,
  onActivateTab,
  onCloseTab,
  onOpenGroupMenu,
  onOpenTabContextMenu,
  onSelectTab,
  onSortableChange,
  onToggleGroup,
  onUpdateWindowName,
  selectedTabIds,
  setSelectedTabIds,
  windowName,
  windowView
}: WindowSectionProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rows = createWindowRows(windowView, collapsedGroupIds);
  const groupColors = new Map(windowView.groupSpans.map((span) => [span.groupId, span.color]));
  const orderedTabIds = rows.flatMap((row) => (row.kind === 'tab' ? [row.tab.id] : []));
  const blocks = useMemo(() => createRenderBlocks(windowView, rows, collapsedGroupIds), [collapsedGroupIds, rows, windowView]);

  useEffect(() => {
    const root = rootRef.current;

    if (!root || !dragEnabled) {
      return;
    }

    const sortables: Sortable[] = [];
    const handleEnd = () => onSortableChange(readSortableWindowStates());

    sortables.push(createSortable(root, true, handleEnd));
    root.querySelectorAll<HTMLElement>('.sortable-group-tabs').forEach((list) => {
      sortables.push(createSortable(list, false, handleEnd));
    });
    syncSortableSelection(root, selectedTabIds);

    return () => {
      sortables.forEach((sortable) => sortable.destroy());
    };
  }, [blocks, dragEnabled, onSortableChange]);

  useEffect(() => {
    const root = rootRef.current;

    if (root && dragEnabled) {
      syncSortableSelection(root, selectedTabIds);
    }
  }, [dragEnabled, selectedTabIds]);

  return (
    <section className="window-section">
      <header className="window-header">
        <WindowTitle
          defaultName={defaultWindowName}
          name={windowName}
          onSave={(name) => onUpdateWindowName(windowView.id, name)}
        />
        <p>
          {windowView.items.length} tabs
          {windowView.focused ? <span>Focused</span> : null}
        </p>
      </header>
      <div className="sortable-window-root tab-list" data-window-id={windowView.id} ref={rootRef} role="list">
        {blocks.map((block) =>
          block.kind === 'tab' ? (
            <div
              className="sortable-root-item sortable-tab-item"
              data-sortable-kind="tab"
              data-tab-id={block.row.tab.id}
              key={`tab-${block.row.tab.id}`}
            >
              <div className="rail-space" />
              <TabListRow
                contextSourceTabId={contextSourceTabId}
                onActivateTab={onActivateTab}
                onCloseTab={onCloseTab}
                onOpenTabContextMenu={onOpenTabContextMenu}
                onSelectTab={onSelectTab}
                orderedTabIds={orderedTabIds}
                row={block.row}
                rowColor={undefined}
                selectedTabIds={selectedTabIds}
              />
            </div>
          ) : (
            <section
              className={`sortable-root-item sortable-group-block group-color-${block.group.color}`}
              data-group-id={block.group.groupId}
              data-sortable-kind="group"
              key={`group-${block.group.groupId}`}
            >
              <div className={`group-rail-item group-color-${block.group.color}`}>
                <GroupLabel
                  collapsed={block.collapsed}
                  group={block.group}
                  onOpenMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenGroupMenu({ group: block.group, x: event.clientX, y: event.clientY });
                  }}
                  onSelectionChange={(selected) =>
                    setSelectedTabIds((current) => setGroupSelection(current, block.group.tabIds, selected))
                  }
                  onToggle={onToggleGroup}
                  selectionState={selectionStateForGroup(selectedTabIds, block.group.tabIds)}
                />
              </div>
              <div className="sortable-group-tabs" data-group-id={block.group.groupId}>
                {block.rows.map((row) =>
                  row.kind === 'group-summary' ? (
                    <div
                      data-sortable-kind="group-summary"
                      data-tab-ids={row.tabIds.join(',')}
                      key={`group-summary-${row.groupId}`}
                    >
                      <TabListRow
                        contextSourceTabId={contextSourceTabId}
                        onActivateTab={onActivateTab}
                        onCloseTab={onCloseTab}
                        onOpenTabContextMenu={onOpenTabContextMenu}
                        onSelectTab={onSelectTab}
                        orderedTabIds={orderedTabIds}
                        row={row}
                        selectedTabIds={selectedTabIds}
                      />
                    </div>
                  ) : (
                    <div
                      className="sortable-tab-item"
                      data-sortable-kind="tab"
                      data-tab-id={row.tab.id}
                      key={`group-tab-${row.tab.id}`}
                    >
                      <TabListRow
                        contextSourceTabId={contextSourceTabId}
                        onActivateTab={onActivateTab}
                        onCloseTab={onCloseTab}
                        onOpenTabContextMenu={onOpenTabContextMenu}
                        onSelectTab={onSelectTab}
                        orderedTabIds={orderedTabIds}
                        row={row}
                        rowColor={groupColors.get(row.groupId)}
                        selectedTabIds={selectedTabIds}
                      />
                    </div>
                  )
                )}
              </div>
            </section>
          )
        )}
      </div>
    </section>
  );
}

function createRenderBlocks(
  windowView: WindowView,
  rows: WindowRow[],
  collapsedGroupIds: ReadonlySet<NativeGroupId>
): RenderBlock[] {
  const rowsByGroup = new Map<NativeGroupId, WindowRow[]>();

  rows.forEach((row) => {
    if (row.groupId === -1) {
      return;
    }

    rowsByGroup.set(row.groupId, [...(rowsByGroup.get(row.groupId) ?? []), row]);
  });

  const spansByStart = new Map(windowView.groupSpans.map((span) => [span.startIndex, span]));
  const blocks: RenderBlock[] = [];

  for (let index = 0; index < windowView.items.length; index += 1) {
    const span = spansByStart.get(index);

    if (span) {
      blocks.push({
        kind: 'group',
        collapsed: collapsedGroupIds.has(span.groupId),
        group: span,
        rows: rowsByGroup.get(span.groupId) ?? []
      });
      index = span.endIndex;
      continue;
    }

    const row = rows.find((candidate) => candidate.kind === 'tab' && candidate.tab.id === windowView.items[index].tab.id);

    if (row?.kind === 'tab') {
      blocks.push({ kind: 'tab', row });
    }
  }

  return blocks;
}

function createSortable(element: HTMLElement, isRoot: boolean, onEnd: () => void) {
  return new Sortable(element, {
    animation: 150,
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    draggable: isRoot ? '.sortable-root-item' : '.sortable-tab-item',
    fallbackOnBody: true,
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
    onMove: (event) => isRoot || event.dragged.dataset.sortableKind === 'tab',
    selectedClass: 'is-selected'
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
