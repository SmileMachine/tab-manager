import { useMemo, useRef } from 'react';
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
import { useSortableWindowLists } from '../hooks/useSortableWindowLists';
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
  const collapsedWindow = collapsedWindowIds.has(windowView.id);
  const rows = useMemo(() => createWindowRows(windowView, collapsedGroupIds), [collapsedGroupIds, windowView]);
  const groupColors = useMemo(() => new Map(windowView.groupSpans.map((span) => [span.groupId, span.color])), [windowView]);
  const orderedTabIds = useMemo(() => rows.flatMap((row) => (row.kind === 'tab' ? [row.tab.id] : [])), [rows]);
  const blocks = useMemo(() => createRenderBlocks(windowView, rows, collapsedGroupIds), [collapsedGroupIds, rows, windowView]);
  const sortableStructureKey = useMemo(() => sortableStructureKeyForWindow(windowView, collapsedGroupIds), [
    collapsedGroupIds,
    windowView
  ]);

  useSortableWindowLists({
    collapsedWindow,
    dragEnabled,
    onSortableChange,
    onSortableStart,
    rootRef,
    selectedTabIds,
    sortableStructureKey,
    windowId: windowView.id
  });

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
        collapsed: span.tabCount > 1 && collapsedGroupIds.has(span.groupId),
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
      .filter((span) => span.tabCount > 1 && collapsedGroupIds.has(span.groupId))
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
