import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import {
  createBulkCloseSummary,
  nextNewGroupTitle,
  planCreateGroup,
  planMoveToGroup
} from '../domain/commands';
import { applyTabFilters, type GroupStatusFilter, type PinnedStatusFilter, type WindowScope } from '../domain/filters';
import { selectTabRange, toggleTabSelection } from '../domain/selection';
import type {
  BrowserSnapshotView,
  BrowserTabGroupColor,
  NativeGroupId,
  NativeTabId,
  NativeWindowId
} from '../domain/types';
import { createChromeBrowserTabsApi, type BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { BulkCloseDialog, type BulkCloseRequest } from './components/BulkCloseDialog';
import { GroupEditPopover, type GroupEditMenuState } from './components/GroupEditPopover';
import { SelectionContextMenu, type SelectionContextMenuState } from './components/SelectionContextMenu';
import { WindowSection } from './components/WindowSection';
import { moveGroupToWindow, updateGroup } from './application/groupActions';
import { reconcileSortableProjection } from './application/sortableActions';
import { activateTab, closeTabs, discardTabs } from './application/tabActions';
import { useBrowserSnapshot } from './hooks/useBrowserSnapshot';
import { useEscapeDispatcher, useEscapeHandler } from './hooks/useEscapeStack';
import { useLoadManagerPreferences, useSaveManagerPreferences } from './hooks/useManagerPreferences';
import { groupsFromView, windowsFromView } from './view/groupOptions';
import { projectSortableWindowsInView, type SortableWindowState } from './view/sortableWindow';
import { updateGroupInView } from './view/updateGroupInView';
import { parseWindowScope, serializeWindowScope } from './view/windowScope';

type Density = 'comfortable' | 'compact';
type ContentWidth = 'full' | 'readable';

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

export function ManagerApp() {
  const [selectedTabIds, setSelectedTabIds] = useState<Set<NativeTabId>>(new Set());
  const [selectionAnchorTabId, setSelectionAnchorTabId] = useState<NativeTabId | undefined>();
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<NativeGroupId>>(new Set());
  const [density, setDensity] = useState<Density>('comfortable');
  const [contentWidth, setContentWidth] = useState<ContentWidth>('full');
  const [search, setSearch] = useState('');
  const [windowScope, setWindowScope] = useState<WindowScope>({ kind: 'current' });
  const [windowNames, setWindowNames] = useState<Record<NativeWindowId, string>>({});
  const [groupStatus, setGroupStatus] = useState<GroupStatusFilter>('all');
  const [pinnedStatus, setPinnedStatus] = useState<PinnedStatusFilter>('all');
  const [groupId, setGroupId] = useState<NativeGroupId | 'all'>('all');
  const [bulkCloseRequest, setBulkCloseRequest] = useState<BulkCloseRequest | undefined>();
  const [groupEditMenu, setGroupEditMenu] = useState<GroupEditMenuState | undefined>();
  const [selectionContextMenu, setSelectionContextMenu] = useState<SelectionContextMenuState | undefined>();
  const [sortableRenderVersion, setSortableRenderVersion] = useState(0);
  const runtimeAvailable = isExtensionRuntimeAvailable();
  const api = useMemo(() => (runtimeAvailable ? createChromeBrowserTabsApi() : undefined), [runtimeAvailable]);
  const handleBrowserStateChanged = useCallback(() => {
    setBulkCloseRequest((current) => (current ? { ...current, invalidated: true } : current));
  }, []);
  useEscapeDispatcher();
  useLoadManagerPreferences({
    enabled: runtimeAvailable,
    setCollapsedGroupIds,
    setContentWidth,
    setDensity,
    setWindowNames,
    setWindowScope
  });
  useSaveManagerPreferences({ collapsedGroupIds, contentWidth, density, windowNames, windowScope });
  const { refresh, setSnapshotView, snapshotView, status } = useBrowserSnapshot({
    api,
    runtimeAvailable,
    setSelectedTabIds,
    onBrowserStateChanged: handleBrowserStateChanged
  });

  useEscapeHandler(
    useCallback(() => {
      if (selectedTabIds.size === 0) {
        return false;
      }

      setSelectedTabIds(new Set());
      setSelectionAnchorTabId(undefined);
      return true;
    }, [selectedTabIds.size])
  );

  const totalTabs = useMemo(
    () => snapshotView.windows.reduce((sum, window) => sum + window.items.length, 0),
    [snapshotView]
  );
  const filteredView = useMemo(
    () => applyTabFilters(snapshotView, { search, windowScope, groupStatus, pinnedStatus, groupId }),
    [groupId, groupStatus, pinnedStatus, search, snapshotView, windowScope]
  );
  const dragEnabled = search === '' && groupStatus === 'all' && pinnedStatus === 'all' && groupId === 'all';
  const groups = useMemo(() => groupsFromView(snapshotView), [snapshotView]);
  const windows = useMemo(() => windowsFromView(snapshotView), [snapshotView]);
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
  const handleSortableWindowChange = useCallback(
    (states: SortableWindowState[]) =>
      handleSortableChange(api, snapshotView, states, refresh, setSnapshotView, setSortableRenderVersion, () => {
        setSelectedTabIds(new Set());
        setSelectionAnchorTabId(undefined);
      }),
    [api, refresh, setSnapshotView, snapshotView]
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

            closeTabs({
              api,
              tabIds: bulkCloseRequest.tabIds,
              refresh: () => {
                setBulkCloseRequest(undefined);
                refresh();
              }
            });
          }}
        />
      ) : null}

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
                key={`${windowView.id}:${sortableRenderVersion}`}
                collapsedGroupIds={collapsedGroupIds}
                contextSourceTabId={selectionContextMenu?.sourceTabId}
                dragEnabled={dragEnabled}
                index={index}
                onActivateTab={(tabId, windowId) => activateTab({ api, tabId, windowId })}
                onToggleGroup={(groupId) => toggleGroup(groupId, setCollapsedGroupIds)}
                onCloseTab={(tabId) => closeTabs({ api, tabIds: [tabId], refresh })}
                onOpenGroupMenu={(state) => {
                  setSelectionContextMenu(undefined);
                  setGroupEditMenu(state);
                }}
                onOpenTabContextMenu={openTabContextMenu}
                onSelectTab={handleTabSelection}
                onSortableChange={handleSortableWindowChange}
                onUpdateWindowName={(windowId, name) => setWindowNames((current) => updateWindowName(current, windowId, name))}
                selectedTabIds={selectedTabIds}
                setSelectedTabIds={setSelectedTabIds}
                windowName={windowNames[windowView.id]}
                windowView={windowView}
              />
            ))
          : null}
      </section>

      {groupEditMenu ? (
        <GroupEditPopover
          colorOptions={groupColorOptions}
          key={groupEditMenu.group.groupId}
          menu={groupEditMenu}
          windows={windows}
          onClose={() => setGroupEditMenu(undefined)}
          onMoveToWindow={(windowId) => {
            const groupId = groupEditMenu.group.groupId;
            setGroupEditMenu(undefined);
            moveGroupToWindow({ api, groupId, targetWindowId: windowId, refresh });
          }}
          onUpdate={(changes) => {
            setSnapshotView((current) => updateGroupInView(current, groupEditMenu.group.groupId, changes));
            setGroupEditMenu((current) =>
              current?.group.groupId === groupEditMenu.group.groupId
                ? { ...current, group: { ...current.group, ...changes } }
                : current
            );
            updateGroup({ api, groupId: groupEditMenu.group.groupId, changes });
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
            discardTabs({ api, view: snapshotView, selectedTabIds: contextMenuTabIds, refresh });
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

function isExtensionRuntimeAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
}

function randomGroupColor() {
  return groupColorOptions[Math.floor(Math.random() * groupColorOptions.length)];
}

function findGroupSpan(view: BrowserSnapshotView, groupId: NativeGroupId) {
  return view.windows.flatMap((window) => window.groupSpans).find((group) => group.groupId === groupId);
}

function updateWindowName(
  current: Record<NativeWindowId, string>,
  windowId: NativeWindowId,
  name: string
): Record<NativeWindowId, string> {
  const next = { ...current };
  const trimmedName = name.trim();

  if (trimmedName) {
    next[windowId] = trimmedName;
  } else {
    delete next[windowId];
  }

  return next;
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

function handleUngroup(api: BrowserTabsApi | undefined, selectedTabIds: ReadonlySet<NativeTabId>, refresh: () => void) {
  if (!api) {
    window.alert('Browser API unavailable.');
    return;
  }

  api.ungroupTabs([...selectedTabIds]).then(refresh).catch(() => window.alert('Unable to remove tabs from group.'));
}

function handleSortableChange(
  api: BrowserTabsApi | undefined,
  view: BrowserSnapshotView,
  states: SortableWindowState[],
  refresh: () => void,
  setSnapshotView: React.Dispatch<React.SetStateAction<BrowserSnapshotView>>,
  setSortableRenderVersion: React.Dispatch<React.SetStateAction<number>>,
  onSuccess: () => void
) {
  if (!api || states.length === 0) {
    return;
  }

  const projectedView = projectSortableWindowsInView(view, states);
  setSortableRenderVersion((version) => version + 1);
  setSnapshotView(projectedView);
  reconcileSortableProjection(api, view, projectedView)
    .then(() => {
      onSuccess();
      refresh();
    })
    .catch(() => {
      setSortableRenderVersion((version) => version + 1);
      setSnapshotView(view);
      window.alert('Unable to move tabs.');
    });
}

function createBulkCloseRequest(view: BrowserSnapshotView, selectedTabIds: ReadonlySet<NativeTabId>): BulkCloseRequest {
  return {
    invalidated: false,
    summary: createBulkCloseSummary(view, selectedTabIds),
    tabIds: [...selectedTabIds]
  };
}
