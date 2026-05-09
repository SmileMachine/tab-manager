import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DraggableAttributes,
  type Over,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, FolderPlus, MinusCircle, Moon, Trash2, X } from 'lucide-react';

import {
  createBulkCloseSummary,
  nextNewGroupTitle,
  planCreateGroup,
  planDiscardTabs,
  planMoveToGroup,
  planTabDrop,
  type TabDropTarget
} from '../domain/commands';
import { projectTabDropInView, projectWindowRowTabPositions } from '../domain/dragProjection';
import { applyTabFilters, type GroupStatusFilter, type PinnedStatusFilter, type WindowScope } from '../domain/filters';
import { createBrowserSnapshotView } from '../domain/snapshot';
import {
  reconcileSelection,
  selectTabRange,
  selectionStateForGroup,
  setGroupSelection,
  toggleTabSelection
} from '../domain/selection';
import type {
  BrowserSnapshotView,
  BrowserTabGroupColor,
  GroupSpan,
  NativeGroupId,
  NativeTabId,
  NativeWindowId,
  WindowView
} from '../domain/types';
import { createWindowRows, type WindowRow } from '../domain/windowRows';
import { createChromeBrowserTabsApi, type BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { loadManagerPreferences, saveManagerPreferences } from '../infrastructure/preferencesStorage';

type Density = 'comfortable' | 'compact';
type ContentWidth = 'full' | 'readable';
type DraggableListeners = ReturnType<typeof useDraggable>['listeners'];
type DragProjection = { draggedTabId: NativeTabId; target: ActiveDropTarget } | undefined;

const groupColorOptions: BrowserTabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange'
];

interface BulkCloseRequest {
  invalidated: boolean;
  summary: ReturnType<typeof createBulkCloseSummary>;
  tabIds: NativeTabId[];
}

interface GroupEditMenuState {
  autoFocusName?: boolean;
  group: GroupSpan | Extract<WindowRow, { kind: 'group-summary' }>;
  x: number;
  y: number;
}

interface GroupOption {
  color: BrowserTabGroupColor;
  id: NativeGroupId;
  title?: string;
  windowIndex: number;
}

interface SelectionContextMenuState {
  fromSelection: boolean;
  sourceTabId?: NativeTabId;
  tabIds: NativeTabId[];
  x: number;
  y: number;
}

type ActiveDropTarget = TabDropTarget | undefined;

export function ManagerApp() {
  const [snapshotView, setSnapshotView] = useState<BrowserSnapshotView>({ windows: [] });
  const [selectedTabIds, setSelectedTabIds] = useState<Set<NativeTabId>>(new Set());
  const [selectionAnchorTabId, setSelectionAnchorTabId] = useState<NativeTabId | undefined>();
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<NativeGroupId>>(new Set());
  const [density, setDensity] = useState<Density>('comfortable');
  const [contentWidth, setContentWidth] = useState<ContentWidth>('full');
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [search, setSearch] = useState('');
  const [windowScope, setWindowScope] = useState<WindowScope>({ kind: 'current' });
  const [groupStatus, setGroupStatus] = useState<GroupStatusFilter>('all');
  const [pinnedStatus, setPinnedStatus] = useState<PinnedStatusFilter>('all');
  const [groupId, setGroupId] = useState<NativeGroupId | 'all'>('all');
  const [bulkCloseRequest, setBulkCloseRequest] = useState<BulkCloseRequest | undefined>();
  const [groupEditMenu, setGroupEditMenu] = useState<GroupEditMenuState | undefined>();
  const [selectionContextMenu, setSelectionContextMenu] = useState<SelectionContextMenuState | undefined>();
  const [activeDropTarget, setActiveDropTarget] = useState<ActiveDropTarget>();
  const [activeDraggedTabId, setActiveDraggedTabId] = useState<NativeTabId | undefined>();
  const syncTimer = useRef<number | undefined>(undefined);
  const api = useMemo(() => (isExtensionRuntimeAvailable() ? createChromeBrowserTabsApi() : undefined), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const refresh = useCallback(() => {
    if (!api) {
      return undefined;
    }

    return refreshSnapshot(setSnapshotView, setSelectedTabIds, setStatus, api);
  }, [api]);

  useEffect(() => {
    if (!isExtensionRuntimeAvailable()) {
      setStatus('unavailable');
      return;
    }

    loadManagerPreferences().then((preferences) => {
      setDensity(preferences.density);
      setContentWidth(preferences.contentWidth);
      setWindowScope(preferences.windowScope);
      setCollapsedGroupIds(new Set(preferences.collapsedGroupIds));
    });
    refresh();
  }, [refresh]);

  useEffect(() => {
    saveManagerPreferences({
      contentWidth,
      density,
      windowScope,
      collapsedGroupIds: [...collapsedGroupIds]
    });
  }, [collapsedGroupIds, contentWidth, density, windowScope]);

  useEffect(() => {
    if (!api || !chrome.runtime?.onMessage) {
      return;
    }

    const listener = (message: unknown) => {
      if (!isBrowserStateChangedMessage(message)) {
        return;
      }

      setBulkCloseRequest((current) => (current ? { ...current, invalidated: true } : current));
      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(refresh, 180);
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      window.clearTimeout(syncTimer.current);
    };
  }, [api, refresh]);

  useEffect(() => {
    const keyListener = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        selectedTabIds.size === 0 ||
        selectionContextMenu ||
        groupEditMenu ||
        bulkCloseRequest
      ) {
        return;
      }

      setSelectedTabIds(new Set());
      setSelectionAnchorTabId(undefined);
    };

    document.addEventListener('keydown', keyListener);

    return () => {
      document.removeEventListener('keydown', keyListener);
    };
  }, [bulkCloseRequest, groupEditMenu, selectedTabIds.size, selectionContextMenu]);

  const totalTabs = useMemo(
    () => snapshotView.windows.reduce((sum, window) => sum + window.items.length, 0),
    [snapshotView]
  );
  const filteredView = useMemo(
    () => applyTabFilters(snapshotView, { search, windowScope, groupStatus, pinnedStatus, groupId }),
    [groupId, groupStatus, pinnedStatus, search, snapshotView, windowScope]
  );
  const groups = useMemo(() => groupsFromView(snapshotView), [snapshotView]);
  const contextMenuTabIds = useMemo(() => new Set(selectionContextMenu?.tabIds ?? []), [selectionContextMenu]);
  const clearSelection = useCallback(() => {
    setSelectedTabIds(new Set());
    setSelectionAnchorTabId(undefined);
  }, []);
  const handleTabSelection = useCallback(
    (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => {
      if (shiftKey) {
        window.getSelection()?.removeAllRanges();
      }

      setSelectedTabIds((current) => {
        if (shiftKey && selectionAnchorTabId !== undefined) {
          return selectTabRange(current, orderedTabIds, selectionAnchorTabId, tabId);
        }

        return toggleTabSelection(current, tabId);
      });
      setSelectionAnchorTabId(tabId);
    },
    [selectionAnchorTabId]
  );
  const openTabContextMenu = useCallback(
    (event: React.MouseEvent, tabId: NativeTabId) => {
      event.preventDefault();
      event.stopPropagation();
      setGroupEditMenu(undefined);
      const fromSelection = selectedTabIds.has(tabId);
      setSelectionContextMenu({
        fromSelection,
        sourceTabId: fromSelection ? undefined : tabId,
        tabIds: fromSelection ? [...selectedTabIds] : [tabId],
        x: event.pageX,
        y: event.pageY
      });
    },
    [selectedTabIds]
  );

  return (
    <main className={`manager-shell density-${density} width-${contentWidth}`}>
      <header className="manager-header">
        <div className="manager-header-inner">
          <div className="title-line">
            <h1>Tab Group Manager</h1>
            <p className="header-summary">
              {snapshotView.windows.length} windows · {totalTabs} tabs
            </p>
            {selectedTabIds.size > 0 ? (
              <span className="selection-chip">
                <span>{selectedTabIds.size} selected</span>
                <button aria-label="Clear selection" type="button" onClick={clearSelection}>
                  <X aria-hidden="true" size={13} />
                </button>
              </span>
            ) : null}
          </div>
          <div className="header-actions" aria-label="View options">
            <div className="segmented-control" aria-label="Detail level">
              <button type="button" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}>
                Detailed
              </button>
              <button type="button" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>
                Brief
              </button>
            </div>
            <div className="segmented-control" aria-label="Content width">
              <button type="button" aria-pressed={contentWidth === 'full'} onClick={() => setContentWidth('full')}>
                Full width
              </button>
              <button
                type="button"
                aria-pressed={contentWidth === 'readable'}
                onClick={() => setContentWidth('readable')}
              >
                Readable width
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="toolbar" aria-label="Search and filters">
        <input
          aria-label="Search tabs"
          className="search-input"
          placeholder="Search title, URL, or domain"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Window scope"
          value={serializeWindowScope(windowScope)}
          onChange={(event) => setWindowScope(parseWindowScope(event.target.value))}
        >
          <option value="current">Current window</option>
          <option value="all">All windows</option>
          {snapshotView.windows.map((window, index) => (
            <option key={window.id} value={`window:${window.id}`}>
              Window {index + 1}
            </option>
          ))}
        </select>
        <select
          aria-label="Group status"
          value={groupStatus}
          onChange={(event) => setGroupStatus(event.target.value as GroupStatusFilter)}
        >
          <option value="all">All tabs</option>
          <option value="grouped">Grouped</option>
          <option value="ungrouped">Ungrouped</option>
        </select>
        <select
          aria-label="Pinned status"
          value={pinnedStatus}
          onChange={(event) => setPinnedStatus(event.target.value as PinnedStatusFilter)}
        >
          <option value="all">Pinned and unpinned</option>
          <option value="pinned">Pinned</option>
          <option value="unpinned">Unpinned</option>
        </select>
        <select
          aria-label="Group filter"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value === 'all' ? 'all' : Number(event.target.value))}
        >
          <option value="all">All groups</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.title || 'Untitled group'}
            </option>
          ))}
        </select>
      </section>

      {bulkCloseRequest ? (
        <BulkCloseDialog
          request={bulkCloseRequest}
          onCancel={() => setBulkCloseRequest(undefined)}
          onConfirm={() => {
            if (bulkCloseRequest.invalidated) {
              setBulkCloseRequest(createBulkCloseRequest(snapshotView, selectedTabIds));
              return;
            }

            handleCloseTabs(api, bulkCloseRequest.tabIds, () => {
              setBulkCloseRequest(undefined);
              refresh();
            });
          }}
        />
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={(event) => {
          const data = event.active.data.current;
          setActiveDraggedTabId(isDropData(data) && data.kind === 'tab' ? data.tabId : undefined);
        }}
        onDragMove={(event) => setActiveDropTarget(dropTargetFromDragEvent(event))}
        onDragOver={(event) => setActiveDropTarget(dropTargetFromDragEvent(event))}
        onDragCancel={() => {
          setActiveDraggedTabId(undefined);
          setActiveDropTarget(undefined);
        }}
        onDragEnd={(event) => {
          const target = dropTargetFromDragEvent(event) ?? activeDropTarget;
          const sourceView = snapshotView;
          setActiveDraggedTabId(undefined);
          setActiveDropTarget(undefined);
          handleTabDrop(api, snapshotView, event, target, refresh, setSnapshotView, sourceView);
        }}
      >
        <section className="manager-content">
          {status === 'loading' ? <p className="empty-state">Loading browser tabs...</p> : null}
          {status === 'unavailable' ? (
            <p className="empty-state">Open this page from the extension to access browser tabs.</p>
          ) : null}
          {status === 'error' ? <p className="empty-state">Unable to read browser tabs.</p> : null}
          {status === 'ready' && snapshotView.windows.length === 0 ? <p className="empty-state">No windows found.</p> : null}

          {status === 'ready'
            ? filteredView.windows.map((windowView, index) => (
                <WindowSection
                  activeDropTarget={activeDropTarget}
                  dragProjection={
                    activeDraggedTabId ? { draggedTabId: activeDraggedTabId, target: activeDropTarget } : undefined
                  }
                  key={windowView.id}
                  collapsedGroupIds={collapsedGroupIds}
                  index={index}
                  onActivateTab={(tabId, windowId) => handleActivateTab(api, tabId, windowId)}
                  onToggleGroup={(groupId) => toggleGroup(groupId, setCollapsedGroupIds)}
                  onCloseTab={(tabId) => handleCloseTabs(api, [tabId], refresh)}
                  onOpenGroupMenu={(state) => {
                    setSelectionContextMenu(undefined);
                    setGroupEditMenu(state);
                  }}
                  onOpenTabContextMenu={openTabContextMenu}
                  contextSourceTabId={selectionContextMenu?.sourceTabId}
                  onSelectTab={handleTabSelection}
                  onUpdateGroup={(groupId, changes) => handleUpdateGroup(api, groupId, changes, refresh)}
                  selectedTabIds={selectedTabIds}
                  setSelectedTabIds={setSelectedTabIds}
                  windowView={windowView}
                />
              ))
            : null}
        </section>
      </DndContext>

      {groupEditMenu ? (
        <GroupEditPopover
          key={groupEditMenu.group.groupId}
          menu={groupEditMenu}
          onClose={() => setGroupEditMenu(undefined)}
          onUpdate={(changes) => {
            setSnapshotView((current) => updateGroupInView(current, groupEditMenu.group.groupId, changes));
            setGroupEditMenu((current) =>
              current?.group.groupId === groupEditMenu.group.groupId
                ? { ...current, group: { ...current.group, ...changes } }
                : current
            );
            handleUpdateGroup(api, groupEditMenu.group.groupId, changes);
          }}
        />
      ) : null}

      {selectionContextMenu && contextMenuTabIds.size > 0 ? (
        <SelectionContextMenu
          groups={groups}
          menu={selectionContextMenu}
          actionTabIds={contextMenuTabIds}
          view={snapshotView}
          onClose={() => setSelectionContextMenu(undefined)}
          onCreateGroup={() => {
            const menu = selectionContextMenu;
            setSelectionContextMenu(undefined);
            handleCreateGroup(
              api,
              snapshotView,
              contextMenuTabIds,
              refresh,
              setGroupEditMenu,
              menu,
              menu.fromSelection
                ? () => {
                    setSelectedTabIds(new Set());
                    setSelectionAnchorTabId(undefined);
                  }
                : undefined
            );
          }}
          onMoveToGroup={(groupId) => {
            const menu = selectionContextMenu;
            setSelectionContextMenu(undefined);
            handleMoveToGroup(
              api,
              snapshotView,
              contextMenuTabIds,
              groupId,
              refresh,
              menu.fromSelection
                ? () => {
                    setSelectedTabIds(new Set());
                    setSelectionAnchorTabId(undefined);
                  }
                : undefined
            );
          }}
          onDiscardTabs={() => {
            setSelectionContextMenu(undefined);
            handleDiscardTabs(api, snapshotView, contextMenuTabIds, refresh);
          }}
          onUngroup={() => {
            setSelectionContextMenu(undefined);
            handleUngroup(api, contextMenuTabIds, refresh);
          }}
          onCloseSelected={() => {
            setSelectionContextMenu(undefined);
            setBulkCloseRequest(createBulkCloseRequest(snapshotView, contextMenuTabIds));
          }}
        />
      ) : null}
    </main>
  );
}

interface WindowSectionProps {
  activeDropTarget: ActiveDropTarget;
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  contextSourceTabId: NativeTabId | undefined;
  dragProjection: DragProjection;
  index: number;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenGroupMenu: (state: GroupEditMenuState) => void;
  onOpenTabContextMenu: (event: React.MouseEvent, tabId: NativeTabId) => void;
  onSelectTab: (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  onUpdateGroup: (groupId: NativeGroupId, changes: { title?: string; color?: BrowserTabGroupColor }) => void;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
  windowView: WindowView;
}

function WindowSection({
  activeDropTarget,
  collapsedGroupIds,
  contextSourceTabId,
  dragProjection,
  index,
  onActivateTab,
  onCloseTab,
  onOpenGroupMenu,
  onOpenTabContextMenu,
  onSelectTab,
  onToggleGroup,
  onUpdateGroup,
  selectedTabIds,
  setSelectedTabIds,
  windowView
}: WindowSectionProps) {
  const rows = createWindowRows(windowView, collapsedGroupIds);
  const projectedWindowView =
    dragProjection?.target && windowContainsTab(rows, dragProjection.draggedTabId)
      ? projectTabDropInView({ windows: [windowView] }, dragProjection.draggedTabId, dragProjection.target).windows[0]
      : undefined;
  const projectedRows = projectedWindowView ? createWindowRows(projectedWindowView, collapsedGroupIds) : undefined;
  const labelRows = projectedRows ?? rows;
  const labelWindowView = projectedWindowView ?? windowView;
  const spansByStart = new Map(labelWindowView.groupSpans.map((span) => [span.startIndex, span]));
  const groupColors = new Map(windowView.groupSpans.map((span) => [span.groupId, span.color]));
  const projectedGroupId = projectedGroupIdFromTarget(rows, dragProjection?.target);
  const groupLabels = createGroupLabels(labelRows, spansByStart, collapsedGroupIds);
  const projectedTabPositions = projectWindowRowTabPositions(rows, dragProjection?.draggedTabId, dragProjection?.target);
  const orderedTabIds = rows.flatMap((row) => (row.kind === 'tab' ? [row.tab.id] : []));

  return (
    <section className="window-section">
      <header className="window-header">
        <h2>
          Window {index + 1}
          {windowView.focused ? <span>Focused</span> : null}
        </h2>
        <p>{windowView.items.length} tabs</p>
      </header>
      <div className="tab-list" role="list">
        {groupLabels.map((label) => (
          <div
            className={`group-rail-item group-color-${label.group.color}`}
            key={`group-label-${label.group.groupId}`}
            style={{ gridRow: `${label.rowStart} / span ${label.rowSpan}` }}
          >
            <GroupLabel
              collapsed={label.collapsed}
              group={label.group}
              onOpenMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenGroupMenu({ group: label.group, x: event.clientX, y: event.clientY });
              }}
              onSelectionChange={(selected) =>
                setSelectedTabIds((current) => setGroupSelection(current, label.group.tabIds, selected))
              }
              onToggle={onToggleGroup}
              selectionState={selectionStateForGroup(selectedTabIds, label.group.tabIds)}
            />
          </div>
        ))}
        {rows.map((row, rowIndex) => (
          <TabListRow
            activeDropTarget={activeDropTarget}
            key={row.kind === 'tab' ? `tab-${row.tab.id}` : `group-${row.groupId}`}
            onActivateTab={onActivateTab}
            onCloseTab={onCloseTab}
            onOpenTabContextMenu={onOpenTabContextMenu}
            onSelectTab={onSelectTab}
            orderedTabIds={orderedTabIds}
            row={row}
            rowColor={
              row.kind === 'tab'
                ? groupColors.get(row.tab.id === dragProjection?.draggedTabId && projectedGroupId !== undefined ? projectedGroupId : row.groupId)
                : undefined
            }
            rowIndex={
              row.kind === 'tab' && row.tab.id !== dragProjection?.draggedTabId
                ? (projectedTabPositions[row.tab.id] ?? rowIndex + 1) - 1
                : rowIndex
            }
            selectedTabIds={selectedTabIds}
            contextSourceTabId={contextSourceTabId}
            setSelectedTabIds={setSelectedTabIds}
          />
        ))}
      </div>
    </section>
  );
}

interface GroupLabelPlacement {
  collapsed: boolean;
  group: GroupSpan | Extract<WindowRow, { kind: 'group-summary' }>;
  rowSpan: number;
  rowStart: number;
}

function createGroupLabels(
  rows: WindowRow[],
  spansByStart: Map<number, GroupSpan>,
  collapsedGroupIds: ReadonlySet<NativeGroupId>
): GroupLabelPlacement[] {
  const labels: GroupLabelPlacement[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    if (row.kind === 'group-summary') {
      labels.push({
        collapsed: true,
        group: row,
        rowStart: rowIndex + 1,
        rowSpan: 1
      });
      continue;
    }

    if (!row.isGroupStart) {
      continue;
    }

    const group = spansByStart.get(row.listIndex);

    if (!group) {
      continue;
    }

    labels.push({
      collapsed: collapsedGroupIds.has(group.groupId),
      group,
      rowStart: rowIndex + 1,
      rowSpan: countVisibleGroupRows(rows, rowIndex, group.groupId)
    });
  }

  return labels;
}

function countVisibleGroupRows(rows: WindowRow[], startIndex: number, groupId: NativeGroupId) {
  let count = 0;

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];

    if (row.kind !== 'tab' || row.groupId !== groupId) {
      break;
    }

    count += 1;
  }

  return count;
}

function windowContainsTab(rows: WindowRow[], tabId: NativeTabId) {
  return rows.some((row) => row.kind === 'tab' && row.tab.id === tabId);
}

function projectedGroupIdFromTarget(rows: WindowRow[], target: ActiveDropTarget): NativeGroupId | undefined {
  if (!target) {
    return undefined;
  }

  if (target.kind === 'group') {
    return target.groupId;
  }

  return rows.find((row) => row.kind === 'tab' && row.tab.id === target.tabId)?.groupId;
}

interface TabListRowProps {
  activeDropTarget: ActiveDropTarget;
  contextSourceTabId: NativeTabId | undefined;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenTabContextMenu: (event: React.MouseEvent, tabId: NativeTabId) => void;
  onSelectTab: (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => void;
  orderedTabIds: NativeTabId[];
  row: WindowRow;
  rowColor?: BrowserTabGroupColor;
  rowIndex: number;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
}

function TabListRow({
  activeDropTarget,
  contextSourceTabId,
  onActivateTab,
  onCloseTab,
  onOpenTabContextMenu,
  onSelectTab,
  orderedTabIds,
  row,
  rowColor,
  rowIndex,
  selectedTabIds,
  setSelectedTabIds
}: TabListRowProps) {
  if (row.kind === 'tab') {
    return (
      <DraggableTabListRow
        activeDropTarget={activeDropTarget}
        contextSourceTabId={contextSourceTabId}
        onActivateTab={onActivateTab}
        onCloseTab={onCloseTab}
        onOpenTabContextMenu={onOpenTabContextMenu}
        onSelectTab={onSelectTab}
        orderedTabIds={orderedTabIds}
        row={row}
        rowColor={rowColor}
        rowIndex={rowIndex}
        selectedTabIds={selectedTabIds}
        setSelectedTabIds={setSelectedTabIds}
      />
    );
  }

  return <DroppableGroupSummaryListRow activeDropTarget={activeDropTarget} row={row} rowIndex={rowIndex} />;
}

function DraggableTabListRow({
  activeDropTarget,
  contextSourceTabId,
  onActivateTab,
  onCloseTab,
  onOpenTabContextMenu,
  onSelectTab,
  orderedTabIds,
  row,
  rowColor,
  rowIndex,
  selectedTabIds,
  setSelectedTabIds
}: Omit<TabListRowProps, 'row'> & { row: Extract<WindowRow, { kind: 'tab' }> }) {
  const draggable = useDraggable({
    id: draggableTabId(row.tab.id),
    data: { kind: 'tab', tabId: row.tab.id }
  });
  const droppable = useDroppable({
    id: droppableTabId(row.tab.id),
    data: { kind: 'tab', tabId: row.tab.id }
  });
  const transform = CSS.Translate.toString(draggable.transform);
  const dropClassName = dropClassForRow(row, activeDropTarget);

  return (
    <div
      className={`tab-grid-row ${rowColor ? `group-color-${rowColor}` : ''} ${dropClassName} ${
        contextSourceTabId === row.tab.id ? 'is-context-source' : ''
      } ${
        draggable.isDragging ? 'is-dragging' : ''
      }`}
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      role="listitem"
      style={{ gridRow: rowIndex + 1, transform }}
    >
      <TabRow
        dragAttributes={draggable.attributes}
        dragListeners={draggable.listeners}
        row={row}
        selected={selectedTabIds.has(row.tab.id)}
        onActivate={() => onActivateTab(row.tab.id, row.tab.windowId)}
        onClose={() => onCloseTab(row.tab.id)}
        onContextMenu={(event) => onOpenTabContextMenu(event, row.tab.id)}
        onToggle={(event) => onSelectTab(row.tab.id, orderedTabIds, 'shiftKey' in event && event.shiftKey)}
      />
    </div>
  );
}

function DroppableGroupSummaryListRow({
  activeDropTarget,
  row,
  rowIndex
}: {
  activeDropTarget: ActiveDropTarget;
  row: Extract<WindowRow, { kind: 'group-summary' }>;
  rowIndex: number;
}) {
  const droppable = useDroppable({
    id: droppableGroupId(row.groupId),
    data: { kind: 'group', groupId: row.groupId }
  });
  const dropClassName = dropClassForRow(row, activeDropTarget);

  return (
    <div
      className={`tab-grid-row group-color-${row.color} ${dropClassName}`}
      ref={droppable.setNodeRef}
      role="listitem"
      style={{ gridRow: rowIndex + 1 }}
    >
      <GroupSummaryRow row={row} />
    </div>
  );
}

interface GroupLabelProps {
  collapsed: boolean;
  group: GroupSpan | Extract<WindowRow, { kind: 'group-summary' }>;
  onOpenMenu: (event: React.MouseEvent) => void;
  onSelectionChange: (selected: boolean) => void;
  onToggle: (groupId: NativeGroupId) => void;
  selectionState: 'unchecked' | 'mixed' | 'checked';
}

function GroupLabel({ collapsed, group, onOpenMenu, onSelectionChange, onToggle, selectionState }: GroupLabelProps) {
  return (
    <div className="group-label" onContextMenu={onOpenMenu}>
      <input
        aria-label={`Select ${group.title ?? 'Untitled group'}`}
        checked={selectionState === 'checked'}
        className="selection-checkbox"
        data-indeterminate={selectionState === 'mixed'}
        ref={(input) => {
          if (input) {
            input.indeterminate = selectionState === 'mixed';
          }
        }}
        type="checkbox"
        onChange={(event) => onSelectionChange(event.target.checked)}
      />
      <div className="group-label-text">
        <strong>{group.title || 'Untitled group'}</strong>
        {!collapsed && group.tabCount > 1 ? <span>{group.tabCount} tabs</span> : null}
      </div>
      {group.tabCount > 1 ? (
        <button
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.title ?? 'group'}`}
          className="icon-button"
          type="button"
          onClick={() => onToggle(group.groupId)}
        >
          {collapsed ? <ChevronRight aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
        </button>
      ) : null}
    </div>
  );
}

function GroupEditPopover({
  menu,
  onClose,
  onUpdate
}: {
  menu: GroupEditMenuState;
  onClose: () => void;
  onUpdate: (changes: { title?: string; color?: BrowserTabGroupColor }) => void;
}) {
  const [title, setTitle] = useState(menu.group.title ?? '');
  const [color, setColor] = useState<BrowserTabGroupColor>(menu.group.color);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const popoverPosition = { left: menu.x + 8, top: menu.y + 8 };

  useEffect(() => {
    const pointerListener = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const keyListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('pointerdown', pointerListener);
    document.addEventListener('keydown', keyListener);

    return () => {
      document.removeEventListener('pointerdown', pointerListener);
      document.removeEventListener('keydown', keyListener);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menu.autoFocusName) {
      return;
    }

    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [menu.autoFocusName]);

  return (
    <div className="group-edit-popover" ref={popoverRef} style={popoverPosition}>
      <label>
        Name
        <input
          ref={nameInputRef}
          value={title}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onClose();
            }
          }}
          onChange={(event) => {
            const nextTitle = event.target.value;
            setTitle(nextTitle);
            onUpdate({ title: nextTitle });
          }}
        />
      </label>
      <div className="color-picker" role="group" aria-label="Color">
        <span className="color-picker-label">Color</span>
        <div className="color-swatches">
          {groupColorOptions.map((option) => (
            <button
              aria-label={`Set color ${option}`}
              aria-pressed={color === option}
              className={`color-swatch group-color-${option}`}
              key={option}
              type="button"
              onClick={() => {
                setColor(option);
                onUpdate({ color: option });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectionContextMenu({
  actionTabIds,
  groups,
  menu,
  onClose,
  onCloseSelected,
  onCreateGroup,
  onDiscardTabs,
  onMoveToGroup,
  onUngroup,
  view
}: {
  actionTabIds: ReadonlySet<NativeTabId>;
  groups: GroupOption[];
  menu: SelectionContextMenuState;
  onClose: () => void;
  onCloseSelected: () => void;
  onCreateGroup: () => void;
  onDiscardTabs: () => void;
  onMoveToGroup: (groupId: NativeGroupId) => void;
  onUngroup: () => void;
  view: BrowserSnapshotView;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuSize, setMenuSize] = useState({ height: 0, width: 260 });
  const createPlan = planCreateGroup(view, actionTabIds);
  const discardPlan = planDiscardTabs(view, actionTabIds);
  const hasGroupedSelection = selectedTabsFromView(view, actionTabIds).some((tab) => tab.groupId !== -1);
  const menuPosition = contextMenuPosition(menu, menuSize);

  useEffect(() => {
    const pointerListener = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const keyListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('pointerdown', pointerListener);
    document.addEventListener('keydown', keyListener);

    return () => {
      document.removeEventListener('pointerdown', pointerListener);
      document.removeEventListener('keydown', keyListener);
    };
  }, [onClose]);

  useEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    setMenuSize({ height: rect.height, width: rect.width });
  }, [actionTabIds.size, groups.length, menu.fromSelection]);

  return (
    <div
      aria-label="Selection actions"
      className="selection-context-menu"
      ref={menuRef}
      role="menu"
      style={menuPosition}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.fromSelection ? (
        <div className="selection-context-header">
          <strong>{actionTabIds.size} selected</strong>
          <span>Batch actions</span>
        </div>
      ) : null}
      <button
        className="context-menu-item"
        disabled={!createPlan.enabled}
        role="menuitem"
        type="button"
        onClick={onCreateGroup}
      >
        <FolderPlus aria-hidden="true" size={16} />
        <span>Create group</span>
        <small>Same window</small>
      </button>
      <button
        className="context-menu-item"
        disabled={!discardPlan.enabled}
        role="menuitem"
        type="button"
        onClick={onDiscardTabs}
      >
        <Moon aria-hidden="true" size={16} />
        <span>Release memory</span>
        <small>{discardPlan.enabled && discardPlan.skippedActiveTabCount > 0 ? `Skipped ${discardPlan.skippedActiveTabCount}` : ''}</small>
      </button>
      <button
        className="context-menu-item"
        disabled={!hasGroupedSelection}
        role="menuitem"
        type="button"
        onClick={onUngroup}
      >
        <MinusCircle aria-hidden="true" size={16} />
        <span>Remove from group</span>
      </button>
      <div className="context-menu-section" role="presentation">
        <div className="context-menu-section-title">Move to group</div>
        <div className="context-menu-group-list">
          {groups.length > 0 ? (
            groups.map((group) => {
              const movePlan = planMoveToGroup(view, actionTabIds, group.id);

              return (
                <button
                  className="context-menu-item"
                  disabled={!movePlan.enabled}
                  key={group.id}
                  role="menuitem"
                  type="button"
                  onClick={() => onMoveToGroup(group.id)}
                >
                  <span aria-hidden="true" className={`context-menu-group-swatch group-color-${group.color}`} />
                  <span>{group.title || 'Untitled group'}</span>
                  <small>Window {group.windowIndex + 1}</small>
                </button>
              );
            })
          ) : (
            <div className="context-menu-empty">No groups</div>
          )}
        </div>
      </div>
      <button className="context-menu-item danger" role="menuitem" type="button" onClick={onCloseSelected}>
        <Trash2 aria-hidden="true" size={16} />
        <span>{actionTabIds.size === 1 ? 'Close tab' : 'Close selected'}</span>
        <small>{actionTabIds.size}</small>
      </button>
    </div>
  );
}

function TabRow({
  dragAttributes,
  dragListeners,
  onActivate,
  onToggle,
  onClose,
  onContextMenu,
  row,
  selected
}: {
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableListeners;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onToggle: (event: React.MouseEvent) => void;
  row: Extract<WindowRow, { kind: 'tab' }>;
  selected: boolean;
}) {
  const faviconUrl = faviconUrlForPage(row.tab.url);

  return (
    <div
      className="tab-row"
      onClick={(event) => onToggle(event)}
      onContextMenu={onContextMenu}
      {...dragAttributes}
      {...dragListeners}
    >
      <input
        aria-label={`Select ${row.tab.title}`}
        checked={selected}
        className="selection-checkbox"
        type="checkbox"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(event);
        }}
        onChange={() => undefined}
      />
      <button
        aria-label={`Go to ${row.tab.title}`}
        className="favicon"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onActivate();
        }}
      >
        {faviconUrl ? <img alt="" src={faviconUrl} /> : null}
      </button>
      <div className="tab-text">
        <strong>{row.tab.title}</strong>
        <span className="tab-url-full">{row.tab.url || 'No URL'}</span>
        <span className="tab-url-short">{domainFromUrl(row.tab.url) || row.tab.url || 'No URL'}</span>
      </div>
      {row.tab.pinned ? <span className="status-pill">Pinned</span> : null}
      <button
        aria-label={`Close ${row.tab.title}`}
        className="row-action icon-button"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

function GroupSummaryRow({ row }: { row: Extract<WindowRow, { kind: 'group-summary' }> }) {
  return (
    <div className="group-summary-row">
      <span>{row.tabCount} tabs</span>
      {row.domains.map((domain) => (
        <span className="domain-chip" key={domain}>
          {domain}
        </span>
      ))}
    </div>
  );
}

function draggableTabId(tabId: NativeTabId) {
  return `tab:${tabId}`;
}

function droppableTabId(tabId: NativeTabId) {
  return `drop-tab:${tabId}`;
}

function droppableGroupId(groupId: NativeGroupId) {
  return `drop-group:${groupId}`;
}

function dropClassForRow(row: WindowRow, target: ActiveDropTarget) {
  return row.kind === 'group-summary' && target?.kind === 'group' && row.groupId === target.groupId ? 'drop-into' : '';
}

function dropTargetFromDragEvent(event: DragMoveEvent | DragOverEvent | DragEndEvent): ActiveDropTarget {
  const over = event.over;

  if (!over) {
    return undefined;
  }

  const data = over.data.current;

  if (!isDropData(data)) {
    return undefined;
  }

  const activeData = event.active.data.current;

  if (isDropData(activeData) && activeData.kind === 'tab' && data.kind === 'tab' && activeData.tabId === data.tabId) {
    return undefined;
  }

  if (data.kind === 'group') {
    return { kind: 'group', groupId: data.groupId };
  }

  return {
    kind: 'tab',
    tabId: data.tabId,
    position: tabDropPosition(event, over)
  };
}

function tabDropPosition(event: DragMoveEvent | DragOverEvent | DragEndEvent, over: Over): 'before' | 'after' {
  const translated = event.active.rect.current.translated;

  if (!translated) {
    return 'after';
  }

  const activeCenterY = translated.top + translated.height / 2;
  const overCenterY = over.rect.top + over.rect.height / 2;

  return activeCenterY < overCenterY ? 'before' : 'after';
}

function isDropData(data: unknown): data is { kind: 'tab'; tabId: NativeTabId } | { kind: 'group'; groupId: NativeGroupId } {
  if (typeof data !== 'object' || data === null || !('kind' in data)) {
    return false;
  }

  if (data.kind === 'tab') {
    return 'tabId' in data && typeof data.tabId === 'number';
  }

  return data.kind === 'group' && 'groupId' in data && typeof data.groupId === 'number';
}

function BulkCloseDialog({
  onCancel,
  onConfirm,
  request
}: {
  onCancel: () => void;
  onConfirm: () => void;
  request: BulkCloseRequest;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-modal="true" className="dialog" role="dialog">
        <h2>Close {request.summary.tabCount} tabs?</h2>
        <p>
          {request.summary.windowCount} windows · pinned tabs: {request.summary.containsPinnedTabs ? 'yes' : 'no'}
        </p>
        {request.invalidated ? (
          <p className="dialog-warning">Browser tab state changed. Review the refreshed confirmation before closing tabs.</p>
        ) : null}
        <ul>
          {request.summary.exampleTitles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            {request.invalidated ? 'Refresh confirmation' : `Close ${request.summary.tabCount} tabs`}
          </button>
        </div>
      </section>
    </div>
  );
}

function toggleGroup(
  groupId: NativeGroupId,
  setCollapsedGroupIds: React.Dispatch<React.SetStateAction<Set<NativeGroupId>>>
) {
  setCollapsedGroupIds((current) => {
    const next = new Set(current);

    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }

    return next;
  });
}

function domainFromUrl(url: string | undefined) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isExtensionRuntimeAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
}

function faviconUrlForPage(pageUrl: string | undefined) {
  if (!pageUrl || !isExtensionRuntimeAvailable()) {
    return undefined;
  }

  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=16`);
}

function randomGroupColor() {
  return groupColorOptions[Math.floor(Math.random() * groupColorOptions.length)];
}

function findGroupSpan(view: BrowserSnapshotView, groupId: NativeGroupId) {
  return view.windows.flatMap((window) => window.groupSpans).find((group) => group.groupId === groupId);
}

function contextMenuPosition(menu: SelectionContextMenuState, size: { height: number; width: number }) {
  const margin = 8;
  const offset = 6;
  const width = size.width || 260;
  const height = size.height || 0;
  const viewportLeft = window.scrollX + margin;
  const viewportRight = window.scrollX + window.innerWidth - margin;
  const viewportTop = window.scrollY + margin;
  const viewportBottom = window.scrollY + window.innerHeight - margin;
  const maxLeft = Math.max(viewportLeft, viewportRight - width);
  const left = Math.min(Math.max(menu.x + offset, viewportLeft), maxLeft);
  const opensUp = height > 0 && menu.y + offset + height > viewportBottom;
  const top = opensUp ? menu.y - height - offset : menu.y + offset;
  const maxTop = Math.max(viewportTop, viewportBottom - height);

  return {
    left,
    top: Math.min(Math.max(top, viewportTop), maxTop)
  };
}

function tabIdsFromView(view: BrowserSnapshotView) {
  return view.windows.flatMap((window) => window.items.map((item) => item.tab.id));
}

function selectedTabsFromView(view: BrowserSnapshotView, selectedTabIds: ReadonlySet<NativeTabId>) {
  return view.windows.flatMap((window) =>
    window.items.flatMap((item) => (selectedTabIds.has(item.tab.id) ? [item.tab] : []))
  );
}

function groupsFromView(view: BrowserSnapshotView) {
  const groups = new Map<NativeGroupId, GroupOption>();

  for (const [windowIndex, window] of view.windows.entries()) {
    for (const span of window.groupSpans) {
      groups.set(span.groupId, { color: span.color, id: span.groupId, title: span.title, windowIndex });
    }
  }

  return [...groups.values()];
}

function updateGroupInView(
  view: BrowserSnapshotView,
  groupId: NativeGroupId,
  changes: { title?: string; color?: BrowserTabGroupColor }
): BrowserSnapshotView {
  return {
    windows: view.windows.map((window) => ({
      ...window,
      items: window.items.map((item) =>
        item.group?.id === groupId ? { ...item, group: { ...item.group, ...changes } } : item
      ),
      groupSpans: window.groupSpans.map((span) => (span.groupId === groupId ? { ...span, ...changes } : span))
    }))
  };
}

function serializeWindowScope(scope: WindowScope) {
  return scope.kind === 'window' ? `window:${scope.windowId}` : scope.kind;
}

function parseWindowScope(value: string): WindowScope {
  if (value === 'current') {
    return { kind: 'current' };
  }

  if (value === 'all') {
    return { kind: 'all' };
  }

  return { kind: 'window', windowId: Number(value.replace('window:', '')) as NativeWindowId };
}

function refreshSnapshot(
  setSnapshotView: React.Dispatch<React.SetStateAction<BrowserSnapshotView>>,
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>,
  setStatus: React.Dispatch<React.SetStateAction<'loading' | 'ready' | 'unavailable' | 'error'>>,
  api: BrowserTabsApi = createChromeBrowserTabsApi()
) {
  return api
    .loadSnapshot()
    .then((snapshot) => {
      const nextView = createBrowserSnapshotView(snapshot);
      setSnapshotView(nextView);
      setSelectedTabIds((current) => reconcileSelection(current, tabIdsFromView(nextView)));
      setStatus('ready');
      return nextView;
    })
    .catch(() => {
      setStatus('error');
      return undefined;
    });
}

function handleCreateGroup(
  api: BrowserTabsApi | undefined,
  view: BrowserSnapshotView,
  selectedTabIds: ReadonlySet<NativeTabId>,
  refresh: () => Promise<BrowserSnapshotView | undefined> | undefined,
  setGroupEditMenu: React.Dispatch<React.SetStateAction<GroupEditMenuState | undefined>>,
  editPosition?: { x: number; y: number },
  onSuccess?: () => void
) {
  const plan = planCreateGroup(view, selectedTabIds);
  if (!api || !plan.enabled) {
    window.alert(plan.enabled ? 'Browser API unavailable.' : 'Create group requires selected tabs from one window.');
    return;
  }

  const title = nextNewGroupTitle(view);
  const color = randomGroupColor();

  api
    .createGroup(plan.tabIds, plan.windowId, title, color)
    .then((groupId) => refresh()?.then((nextView) => ({ groupId, nextView })))
    .then((result) => {
      const group = result?.nextView ? findGroupSpan(result.nextView, result.groupId) : undefined;

      if (!group) {
        return;
      }

      onSuccess?.();
      setGroupEditMenu({
        autoFocusName: true,
        group,
        x: editPosition ? editPosition.x - window.scrollX : window.innerWidth / 2,
        y: editPosition ? editPosition.y - window.scrollY : window.innerHeight / 2
      });
    })
    .catch(() => window.alert('Unable to create group.'));
}

function handleMoveToGroup(
  api: BrowserTabsApi | undefined,
  view: BrowserSnapshotView,
  selectedTabIds: ReadonlySet<NativeTabId>,
  targetGroupId: NativeGroupId,
  refresh: () => Promise<BrowserSnapshotView | undefined> | undefined,
  onSuccess?: () => void
) {
  const plan = planMoveToGroup(view, selectedTabIds, targetGroupId);
  if (!api || !plan.enabled) {
    window.alert(plan.enabled ? 'Browser API unavailable.' : 'Choose a target group.');
    return;
  }

  api
    .moveTabsToGroup(plan.tabIds, plan.targetGroupId, plan.targetWindowId)
    .then(() => refresh()?.then(() => onSuccess?.()))
    .catch(() => window.alert('Unable to move tabs.'));
}

function handleDiscardTabs(
  api: BrowserTabsApi | undefined,
  view: BrowserSnapshotView,
  selectedTabIds: ReadonlySet<NativeTabId>,
  refresh: () => Promise<BrowserSnapshotView | undefined> | undefined
) {
  const plan = planDiscardTabs(view, selectedTabIds);

  if (!api || !plan.enabled) {
    window.alert(plan.enabled ? 'Browser API unavailable.' : 'No inactive tabs can be released.');
    return;
  }

  api.discardTabs(plan.tabIds).then(() => refresh()).catch(() => window.alert('Unable to release tab memory.'));
}

function handleUngroup(api: BrowserTabsApi | undefined, selectedTabIds: ReadonlySet<NativeTabId>, refresh: () => void) {
  if (!api) {
    window.alert('Browser API unavailable.');
    return;
  }

  api.ungroupTabs([...selectedTabIds]).then(refresh).catch(() => window.alert('Unable to remove tabs from group.'));
}

function handleCloseTabs(api: BrowserTabsApi | undefined, tabIds: NativeTabId[], refresh: () => void) {
  if (!api) {
    window.alert('Browser API unavailable.');
    return;
  }

  api.closeTabs(tabIds).then(refresh).catch(() => window.alert('Unable to close tabs.'));
}

function handleActivateTab(api: BrowserTabsApi | undefined, tabId: NativeTabId, windowId: NativeWindowId) {
  if (!api) {
    window.alert('Browser API unavailable.');
    return;
  }

  api.activateTab(tabId, windowId).catch(() => window.alert('Unable to activate tab.'));
}

function handleUpdateGroup(
  api: BrowserTabsApi | undefined,
  groupId: NativeGroupId,
  changes: { title?: string; color?: BrowserTabGroupColor },
  refresh?: () => void
) {
  if (!api) {
    window.alert('Browser API unavailable.');
    return;
  }

  api
    .updateGroup(groupId, changes)
    .then(() => refresh?.())
    .catch(() => window.alert('Unable to update group.'));
}

function handleTabDrop(
  api: BrowserTabsApi | undefined,
  view: BrowserSnapshotView,
  event: DragEndEvent,
  target: ActiveDropTarget,
  refresh: () => void,
  setSnapshotView: React.Dispatch<React.SetStateAction<BrowserSnapshotView>>,
  sourceView: BrowserSnapshotView
) {
  const activeData = event.active.data.current;

  if (!isDropData(activeData) || activeData.kind !== 'tab' || !target) {
    return;
  }

  const plan = planTabDrop(view, activeData.tabId, target);

  if (!api || !plan.enabled) {
    return;
  }

  setSnapshotView(projectTabDropInView(view, activeData.tabId, target));
  executeTabDropPlan(api, plan)
    .then(refresh)
    .catch(() => {
      setSnapshotView(sourceView);
      window.alert('Unable to move tab.');
    });
}

async function executeTabDropPlan(
  api: BrowserTabsApi,
  plan: Extract<ReturnType<typeof planTabDrop>, { enabled: true }>
) {
  await api.moveTab(plan.move.tabId, plan.move.windowId, plan.move.index);

  if (!plan.group) {
    return;
  }

  if (plan.group.kind === 'join') {
    await api.moveTabToGroup(plan.move.tabId, plan.group.groupId);
    return;
  }

  await api.ungroupTabs([plan.move.tabId]);
}

function isGroupColor(color: string): color is BrowserTabGroupColor {
  return ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'].includes(color);
}

function createBulkCloseRequest(view: BrowserSnapshotView, selectedTabIds: ReadonlySet<NativeTabId>): BulkCloseRequest {
  return {
    invalidated: false,
    summary: createBulkCloseSummary(view, selectedTabIds),
    tabIds: [...selectedTabIds]
  };
}

function isBrowserStateChangedMessage(message: unknown): message is { type: 'browser-state-changed' } {
  return typeof message === 'object' && message !== null && 'type' in message && message.type === 'browser-state-changed';
}
