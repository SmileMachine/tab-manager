import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

import { createBulkCloseSummary, planCreateGroup, planMoveToGroup } from '../domain/commands';
import { applyTabFilters, type GroupStatusFilter, type PinnedStatusFilter, type WindowScope } from '../domain/filters';
import { createBrowserSnapshotView } from '../domain/snapshot';
import {
  reconcileSelection,
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
  group: GroupSpan | Extract<WindowRow, { kind: 'group-summary' }>;
  x: number;
  y: number;
}

export function ManagerApp() {
  const [snapshotView, setSnapshotView] = useState<BrowserSnapshotView>({ windows: [] });
  const [selectedTabIds, setSelectedTabIds] = useState<Set<NativeTabId>>(new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<NativeGroupId>>(new Set());
  const [density, setDensity] = useState<Density>('comfortable');
  const [contentWidth, setContentWidth] = useState<ContentWidth>('full');
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [search, setSearch] = useState('');
  const [windowScope, setWindowScope] = useState<WindowScope>({ kind: 'current' });
  const [groupStatus, setGroupStatus] = useState<GroupStatusFilter>('all');
  const [pinnedStatus, setPinnedStatus] = useState<PinnedStatusFilter>('all');
  const [groupId, setGroupId] = useState<NativeGroupId | 'all'>('all');
  const [targetGroupId, setTargetGroupId] = useState<NativeGroupId | 'none'>('none');
  const [bulkCloseRequest, setBulkCloseRequest] = useState<BulkCloseRequest | undefined>();
  const [groupEditMenu, setGroupEditMenu] = useState<GroupEditMenuState | undefined>();
  const syncTimer = useRef<number | undefined>(undefined);
  const api = useMemo(() => (isExtensionRuntimeAvailable() ? createChromeBrowserTabsApi() : undefined), []);

  const refresh = useCallback(() => {
    if (!api) {
      return;
    }

    refreshSnapshot(setSnapshotView, setSelectedTabIds, setStatus, api);
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

  const totalTabs = useMemo(
    () => snapshotView.windows.reduce((sum, window) => sum + window.items.length, 0),
    [snapshotView]
  );
  const filteredView = useMemo(
    () => applyTabFilters(snapshotView, { search, windowScope, groupStatus, pinnedStatus, groupId }),
    [groupId, groupStatus, pinnedStatus, search, snapshotView, windowScope]
  );
  const groups = useMemo(() => groupsFromView(snapshotView), [snapshotView]);

  return (
    <main className={`manager-shell density-${density} width-${contentWidth}`}>
      <header className="manager-header">
        <div className="manager-header-inner">
          <div className="title-line">
            <h1>Tab Group Manager</h1>
            <p className="header-summary">
              {snapshotView.windows.length} windows · {totalTabs} tabs · {selectedTabIds.size} selected
            </p>
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

      {selectedTabIds.size > 0 ? (
        <section className="selection-bar" aria-label="Selection actions">
          <strong>{selectedTabIds.size} selected</strong>
          <button type="button" onClick={() => handleCreateGroup(api, snapshotView, selectedTabIds, refresh)}>
            Create group
          </button>
          <select
            aria-label="Move target group"
            value={targetGroupId}
            onChange={(event) => setTargetGroupId(event.target.value === 'none' ? 'none' : Number(event.target.value))}
          >
            <option value="none">Choose group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.title || 'Untitled group'} · Window {group.windowIndex + 1}
              </option>
            ))}
          </select>
          <button
            disabled={targetGroupId === 'none'}
            type="button"
            onClick={() => {
              if (targetGroupId !== 'none') {
                handleMoveToGroup(api, snapshotView, selectedTabIds, targetGroupId, refresh);
              }
            }}
          >
            Move to group
          </button>
          <button type="button" onClick={() => handleUngroup(api, selectedTabIds, refresh)}>
            Remove from group
          </button>
          <button type="button" onClick={() => setBulkCloseRequest(createBulkCloseRequest(snapshotView, selectedTabIds))}>
            Close selected
          </button>
        </section>
      ) : null}

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
                key={windowView.id}
                collapsedGroupIds={collapsedGroupIds}
                index={index}
                onActivateTab={(tabId, windowId) => handleActivateTab(api, tabId, windowId)}
                onToggleGroup={(groupId) => toggleGroup(groupId, setCollapsedGroupIds)}
                onCloseTab={(tabId) => handleCloseTabs(api, [tabId], refresh)}
                onOpenGroupMenu={setGroupEditMenu}
                onUpdateGroup={(groupId, changes) => handleUpdateGroup(api, groupId, changes, refresh)}
                selectedTabIds={selectedTabIds}
                setSelectedTabIds={setSelectedTabIds}
                windowView={windowView}
              />
            ))
          : null}
      </section>

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
    </main>
  );
}

interface WindowSectionProps {
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  index: number;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenGroupMenu: (state: GroupEditMenuState) => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  onUpdateGroup: (groupId: NativeGroupId, changes: { title?: string; color?: BrowserTabGroupColor }) => void;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
  windowView: WindowView;
}

function WindowSection({
  collapsedGroupIds,
  index,
  onActivateTab,
  onCloseTab,
  onOpenGroupMenu,
  onToggleGroup,
  onUpdateGroup,
  selectedTabIds,
  setSelectedTabIds,
  windowView
}: WindowSectionProps) {
  const rows = createWindowRows(windowView, collapsedGroupIds);
  const spansByStart = new Map(windowView.groupSpans.map((span) => [span.startIndex, span]));
  const groupColors = new Map(windowView.groupSpans.map((span) => [span.groupId, span.color]));
  const groupLabels = createGroupLabels(rows, spansByStart, collapsedGroupIds);

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
            key={row.kind === 'tab' ? `tab-${row.tab.id}` : `group-${row.groupId}`}
            onActivateTab={onActivateTab}
            onCloseTab={onCloseTab}
            row={row}
            rowColor={row.kind === 'tab' && row.groupId !== -1 ? groupColors.get(row.groupId) : undefined}
            rowIndex={rowIndex}
            selectedTabIds={selectedTabIds}
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

interface TabListRowProps {
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  row: WindowRow;
  rowColor?: BrowserTabGroupColor;
  rowIndex: number;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
}

function TabListRow({
  onActivateTab,
  onCloseTab,
  row,
  rowColor,
  rowIndex,
  selectedTabIds,
  setSelectedTabIds
}: TabListRowProps) {
  const grouped = row.kind === 'tab' ? row.groupId !== -1 : true;
  const color = row.kind === 'group-summary' ? row.color : rowColor;

  return (
    <div
      className={`tab-grid-row ${grouped && color ? `group-color-${color}` : ''}`}
      role="listitem"
      style={{ gridRow: rowIndex + 1 }}
    >
      {row.kind === 'tab' ? (
        <TabRow
          row={row}
          selected={selectedTabIds.has(row.tab.id)}
          onActivate={() => onActivateTab(row.tab.id, row.tab.windowId)}
          onClose={() => onCloseTab(row.tab.id)}
          onToggle={() => setSelectedTabIds((current) => toggleTabSelection(current, row.tab.id))}
        />
      ) : (
        <GroupSummaryRow row={row} />
      )}
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

  return (
    <div className="group-edit-popover" ref={popoverRef} style={popoverPosition}>
      <label>
        Name
        <input
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

function TabRow({
  onActivate,
  onToggle,
  onClose,
  row,
  selected
}: {
  onActivate: () => void;
  onClose: () => void;
  onToggle: () => void;
  row: Extract<WindowRow, { kind: 'tab' }>;
  selected: boolean;
}) {
  const faviconUrl = faviconUrlForPage(row.tab.url);

  return (
    <div className="tab-row" onClick={onToggle}>
      <input
        aria-label={`Select ${row.tab.title}`}
        checked={selected}
        className="selection-checkbox"
        type="checkbox"
        onClick={(event) => event.stopPropagation()}
        onChange={onToggle}
      />
      <button
        aria-label={`Go to ${row.tab.title}`}
        className="favicon"
        type="button"
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

function tabIdsFromView(view: BrowserSnapshotView) {
  return view.windows.flatMap((window) => window.items.map((item) => item.tab.id));
}

function groupsFromView(view: BrowserSnapshotView) {
  const groups = new Map<NativeGroupId, { id: NativeGroupId; title?: string; windowIndex: number }>();

  for (const [windowIndex, window] of view.windows.entries()) {
    for (const span of window.groupSpans) {
      groups.set(span.groupId, { id: span.groupId, title: span.title, windowIndex });
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
  api
    .loadSnapshot()
    .then((snapshot) => {
      const nextView = createBrowserSnapshotView(snapshot);
      setSnapshotView(nextView);
      setSelectedTabIds((current) => reconcileSelection(current, tabIdsFromView(nextView)));
      setStatus('ready');
    })
    .catch(() => {
      setStatus('error');
    });
}

function handleCreateGroup(
  api: BrowserTabsApi | undefined,
  view: BrowserSnapshotView,
  selectedTabIds: ReadonlySet<NativeTabId>,
  refresh: () => void
) {
  const plan = planCreateGroup(view, selectedTabIds);
  if (!api || !plan.enabled) {
    window.alert(plan.enabled ? 'Browser API unavailable.' : 'Create group requires selected tabs from one window.');
    return;
  }

  const title = window.prompt('Group name', 'New group');
  if (title === null) {
    return;
  }

  api.createGroup(plan.tabIds, title, 'blue').then(refresh).catch(() => window.alert('Unable to create group.'));
}

function handleMoveToGroup(
  api: BrowserTabsApi | undefined,
  view: BrowserSnapshotView,
  selectedTabIds: ReadonlySet<NativeTabId>,
  targetGroupId: NativeGroupId,
  refresh: () => void
) {
  const plan = planMoveToGroup(view, selectedTabIds, targetGroupId);
  if (!api || !plan.enabled) {
    window.alert(plan.enabled ? 'Browser API unavailable.' : 'Choose a target group.');
    return;
  }

  api
    .moveTabsToGroup(plan.tabIds, plan.targetGroupId, plan.targetWindowId)
    .then(refresh)
    .catch(() => window.alert('Unable to move tabs.'));
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
