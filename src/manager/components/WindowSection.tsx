import { useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { selectionStateForGroup, setGroupSelection } from '../../domain/selection';
import type { GroupSpan, NativeGroupId, NativeTabId, NativeWindowId, WindowView } from '../../domain/types';
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

export function WindowSection({
  collapsedGroupIds,
  collapsedWindowIds,
  contextSourceTabId,
  defaultWindowName,
  dragEnabled,
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
  const groupsById = useMemo(() => new Map(windowView.groupSpans.map((span) => [span.groupId, span])), [windowView]);
  const orderedTabIds = useMemo(() => rows.flatMap((row) => (row.kind === 'tab' ? [row.tab.id] : [])), [rows]);
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
            {rows.map((row) => (
              <SortableWindowRow
                contextSourceTabId={contextSourceTabId}
                group={row.groupId === -1 ? undefined : groupsById.get(row.groupId)}
                key={row.kind === 'tab' ? `tab-${row.tab.id}` : `group-summary-${row.groupId}`}
                onActivateTab={onActivateTab}
                onCloseTab={onCloseTab}
                onOpenGroupMenu={onOpenGroupMenu}
                onOpenTabContextMenu={onOpenTabContextMenu}
                onSelectTab={onSelectTab}
                onSelectionChange={(group, selected) =>
                  setSelectedTabIds((current) => setGroupSelection(current, group.tabIds, selected))
                }
                onToggleGroup={onToggleGroup}
                orderedTabIds={orderedTabIds}
                row={row}
                selectedTabIds={selectedTabIds}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

interface SortableWindowRowProps {
  contextSourceTabId: NativeTabId | undefined;
  group: GroupSpan | undefined;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenGroupMenu: (state: GroupEditMenuState) => void;
  onOpenTabContextMenu: (event: React.MouseEvent, tabId: NativeTabId) => void;
  onSelectTab: (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => void;
  onSelectionChange: (group: GroupSpan, selected: boolean) => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  orderedTabIds: NativeTabId[];
  row: WindowRow;
  selectedTabIds: ReadonlySet<NativeTabId>;
}

function SortableWindowRow({
  contextSourceTabId,
  group,
  onActivateTab,
  onCloseTab,
  onOpenGroupMenu,
  onOpenTabContextMenu,
  onSelectTab,
  onSelectionChange,
  onToggleGroup,
  orderedTabIds,
  row,
  selectedTabIds
}: SortableWindowRowProps) {
  if (row.kind === 'group-summary') {
    const summaryGroup = groupFromSummary(row);

    return (
      <div
        className={`sortable-root-item sortable-group-summary-item group-color-${row.color}`}
        data-group-id={row.groupId}
        data-sortable-kind="group-summary"
        data-tab-ids={row.tabIds.join(',')}
      >
        <GroupRail
          collapsed
          group={group ?? summaryGroup}
          onOpenGroupMenu={onOpenGroupMenu}
          onSelectionChange={onSelectionChange}
          onToggleGroup={onToggleGroup}
          selectedTabIds={selectedTabIds}
        />
        <div className={`tab-grid-row group-summary-grid-row group-color-${row.color}`}>
          <GroupSummaryRow row={row} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`sortable-root-item sortable-tab-item ${row.groupId === -1 ? '' : `group-color-${group?.color ?? 'grey'}`}`}
      data-group-id={row.groupId === -1 ? undefined : row.groupId}
      data-sortable-kind="tab"
      data-tab-id={row.tab.id}
    >
      {group ? (
        <GroupRail
          collapsed={false}
          group={group}
          onOpenGroupMenu={onOpenGroupMenu}
          onSelectionChange={onSelectionChange}
          onToggleGroup={onToggleGroup}
          selectedTabIds={selectedTabIds}
          visible={row.isGroupStart}
        />
      ) : (
        <div className="rail-space" />
      )}
      <TabListRow
        contextSourceTabId={contextSourceTabId}
        onActivateTab={onActivateTab}
        onCloseTab={onCloseTab}
        onOpenTabContextMenu={onOpenTabContextMenu}
        onSelectTab={onSelectTab}
        orderedTabIds={orderedTabIds}
        row={row}
        rowColor={group?.color}
        selectedTabIds={selectedTabIds}
      />
    </div>
  );
}

interface GroupRailProps {
  collapsed: boolean;
  group: GroupSpan;
  onOpenGroupMenu: (state: GroupEditMenuState) => void;
  onSelectionChange: (group: GroupSpan, selected: boolean) => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  selectedTabIds: ReadonlySet<NativeTabId>;
  visible?: boolean;
}

function GroupRail({
  collapsed,
  group,
  onOpenGroupMenu,
  onSelectionChange,
  onToggleGroup,
  selectedTabIds,
  visible = true
}: GroupRailProps) {
  return (
    <div className={`group-rail-item group-color-${group.color} ${visible ? '' : 'is-empty'}`}>
      {visible ? (
        <GroupLabel
          collapsed={collapsed}
          group={group}
          onOpenMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenGroupMenu({ group, x: event.clientX, y: event.clientY });
          }}
          onSelectionChange={(selected) => onSelectionChange(group, selected)}
          onToggle={onToggleGroup}
          selectionState={selectionStateForGroup(selectedTabIds, group.tabIds)}
        />
      ) : null}
    </div>
  );
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

function groupFromSummary(row: Extract<WindowRow, { kind: 'group-summary' }>): GroupSpan {
  return {
    color: row.color,
    endIndex: row.tabCount - 1,
    groupId: row.groupId,
    startIndex: 0,
    tabCount: row.tabCount,
    tabIds: row.tabIds,
    title: row.title,
    windowId: row.windowId
  };
}
