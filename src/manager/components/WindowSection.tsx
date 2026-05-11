import { useEffect, useMemo, useRef } from 'react';
import Sortable from 'sortablejs/modular/sortable.complete.esm.js';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
import { debugDrag } from '../debugLog';
import type { SortableWindowState } from '../view/sortableWindow';
import type { GroupEditMenuState } from './GroupEditPopover';
import { GroupLabel } from './GroupLabel';
import { GroupSummaryRow } from './GroupSummaryRow';
import { TabListRow } from './TabListRow';
import { WindowTitle } from './WindowTitle';

export interface WindowSectionProps {
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  collapsedWindowIds: ReadonlySet<NativeWindowId>;
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
  onSortableStart: () => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  onToggleWindow: (windowId: NativeWindowId) => void;
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
      summaryRow: Extract<WindowRow, { kind: 'group-summary' }>;
      rows: WindowRow[];
    };

export function WindowSection({
  collapsedGroupIds,
  collapsedWindowIds,
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
  onSortableStart,
  onToggleGroup,
  onToggleWindow,
  onUpdateWindowName,
  selectedTabIds,
  setSelectedTabIds,
  windowName,
  windowView
}: WindowSectionProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onSortableChangeRef = useRef(onSortableChange);
  const onSortableStartRef = useRef(onSortableStart);
  const collapsedWindow = collapsedWindowIds.has(windowView.id);
  const rows = useMemo(() => createWindowRows(windowView, collapsedGroupIds), [collapsedGroupIds, windowView]);
  const groupColors = useMemo(() => new Map(windowView.groupSpans.map((span) => [span.groupId, span.color])), [windowView]);
  const orderedTabIds = useMemo(() => rows.flatMap((row) => (row.kind === 'tab' ? [row.tab.id] : [])), [rows]);
  const blocks = useMemo(() => createRenderBlocks(windowView, rows, collapsedGroupIds), [collapsedGroupIds, rows, windowView]);
  const sortableStructureKey = useMemo(() => sortableStructureKeyForWindow(windowView, collapsedGroupIds), [
    collapsedGroupIds,
    windowView
  ]);

  useEffect(() => {
    onSortableChangeRef.current = onSortableChange;
  }, [onSortableChange]);

  useEffect(() => {
    onSortableStartRef.current = onSortableStart;
  }, [onSortableStart]);

  useEffect(() => {
    const root = rootRef.current;

    if (!root || !dragEnabled || collapsedWindow) {
      return;
    }

    const sortables: Sortable[] = [];
    const handleEnd = () => {
      debugDrag('sortable onEnd read states', { windowId: windowView.id });
      onSortableChangeRef.current(readSortableWindowStates());
      window.requestAnimationFrame(cleanupSortableArtifacts);
    };

    debugDrag('sortable effect create', {
      blockCount: blocks.length,
      collapsedWindow,
      dragEnabled,
      selectedCount: selectedTabIds.size,
      windowId: windowView.id
    });
    sortables.push(createSortable(root, true, () => onSortableStartRef.current(), handleEnd));
    root.querySelectorAll<HTMLElement>('.sortable-group-tabs').forEach((list) => {
      sortables.push(createSortable(list, false, () => onSortableStartRef.current(), handleEnd));
    });
    syncSortableSelection(root, selectedTabIds);

    return () => {
      debugDrag('sortable effect cleanup', {
        blockCount: blocks.length,
        collapsedWindow,
        dragEnabled,
        selectedCount: selectedTabIds.size,
        windowId: windowView.id
      });
      cleanupSortableArtifacts();
      sortables.forEach((sortable) => sortable.destroy());
    };
  }, [collapsedWindow, dragEnabled, sortableStructureKey]);

  useEffect(() => {
    const root = rootRef.current;

    if (root && dragEnabled && !collapsedWindow) {
      syncSortableSelection(root, selectedTabIds);
    }
  }, [collapsedWindow, dragEnabled, selectedTabIds]);

  return (
    <section className={`window-section ${collapsedWindow ? 'is-collapsed' : ''}`}>
      <header className="window-header">
        <div className="window-header-title">
          <button
            aria-label={`${collapsedWindow ? 'Expand' : 'Collapse'} ${windowName || defaultWindowName}`}
            aria-expanded={!collapsedWindow}
            className="icon-button window-collapse-button"
            type="button"
            onClick={() => onToggleWindow(windowView.id)}
          >
            {collapsedWindow ? <ChevronRight aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
          </button>
          <WindowTitle
            defaultName={defaultWindowName}
            name={windowName}
            onSave={(name) => onUpdateWindowName(windowView.id, name)}
          />
        </div>
        <p>
          {windowView.items.length} tabs
          {windowView.focused ? <span>Focused</span> : null}
        </p>
      </header>
      <div className="window-collapse-panel" aria-hidden={collapsedWindow}>
        <div className="window-collapse-content">
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
                  className={`sortable-root-item sortable-group-block group-color-${block.group.color} ${
                    block.collapsed ? 'is-collapsed' : ''
                  }`}
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
                  <div className="group-tabs-column">
                    <div className={`group-summary-panel group-color-${block.group.color}`} aria-hidden={!block.collapsed}>
                      <div className="group-summary-content">
                        <div className="tab-grid-row group-summary-grid-row">
                          <GroupSummaryRow row={block.summaryRow} />
                        </div>
                      </div>
                    </div>
                    <div className="group-tabs-panel" aria-hidden={block.collapsed}>
                      <div className="group-tabs-content">
                        <div className="sortable-group-tabs" data-group-id={block.group.groupId}>
                          {block.rows.map((row) =>
                            row.kind === 'tab' ? (
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
                            ) : null
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="sortable-group-tabs-projection" data-group-id={block.group.groupId}>
                      {block.group.tabIds.map((tabId) => (
                        <div
                          data-sortable-kind="tab"
                          data-tab-id={tabId}
                          key={`projection-tab-${tabId}`}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              )
            )}
          </div>
        </div>
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
  const summaryRowsByGroup = new Map<NativeGroupId, Extract<WindowRow, { kind: 'group-summary' }>>();

  rows.forEach((row) => {
    if (row.groupId === -1) {
      return;
    }

    if (row.kind === 'group-summary') {
      summaryRowsByGroup.set(row.groupId, row);
    } else {
      rowsByGroup.set(row.groupId, [...(rowsByGroup.get(row.groupId) ?? []), row]);
    }
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
        rows: rowsByGroup.get(span.groupId) ?? rowsForSpan(windowView, span),
        summaryRow: summaryRowsByGroup.get(span.groupId) ?? summaryRowForSpan(windowView, span)
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

function sortableStructureKeyForWindow(windowView: WindowView, collapsedGroupIds: ReadonlySet<NativeGroupId>) {
  return JSON.stringify({
    collapsedGroups: windowView.groupSpans
      .filter((span) => collapsedGroupIds.has(span.groupId))
      .map((span) => span.groupId),
    groups: windowView.groupSpans.map((span) => ({
      groupId: span.groupId,
      tabIds: span.tabIds
    })),
    tabs: windowView.items.map((item) => ({
      groupId: item.tab.groupId,
      id: item.tab.id,
      index: item.tab.index,
      windowId: item.tab.windowId
    })),
    windowId: windowView.id
  });
}

function rowsForSpan(windowView: WindowView, span: GroupSpan): WindowRow[] {
  return span.tabIds.flatMap((tabId) => {
    const itemIndex = windowView.items.findIndex((item) => item.tab.id === tabId);
    const item = windowView.items[itemIndex];

    return item
      ? [
          {
            kind: 'tab' as const,
            groupId: span.groupId,
            isGroupEnd: itemIndex === span.endIndex,
            isGroupStart: itemIndex === span.startIndex,
            listIndex: itemIndex,
            tab: item.tab
          }
        ]
      : [];
  });
}

function summaryRowForSpan(windowView: WindowView, span: GroupSpan): Extract<WindowRow, { kind: 'group-summary' }> {
  const tabs = span.tabIds.flatMap((tabId) => {
    const item = windowView.items.find((candidate) => candidate.tab.id === tabId);
    return item ? [item.tab] : [];
  });

  return {
    kind: 'group-summary',
    color: span.color,
    domains: uniqueDomains(tabs).slice(0, 3),
    groupId: span.groupId,
    tabCount: span.tabCount,
    tabIds: span.tabIds,
    title: span.title,
    windowId: span.windowId
  };
}

function uniqueDomains(tabs: Array<WindowView['items'][number]['tab']>) {
  return [...new Set(tabs.flatMap((tab) => domainFromUrl(tab.url)))];
}

function domainFromUrl(url: string | undefined) {
  if (!url) {
    return [];
  }

  try {
    return [new URL(url).hostname];
  } catch {
    return [];
  }
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
