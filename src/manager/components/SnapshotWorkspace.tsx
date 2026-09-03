import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, Check, ChevronRight, Download, ExternalLink, GitCompare, Pencil, RotateCcw, Upload, X } from 'lucide-react';

import type { OperationRecord, PortableWorkspace, WorkspaceImportMode, WorkspaceImportPreview, RollbackPreview } from '../../codex/protocol';
import { applyTabFilters, type GroupStatusFilter, type PinnedStatusFilter, type WindowScope } from '../../domain/filters';
import type { NamedSnapshot, OperationSnapshot, SnapshotActions } from '../application/snapshotActions';
import { NamedSnapshotContextMenu, type NamedSnapshotContextMenuState } from './NamedSnapshotContextMenu';
import { SelectionChip } from './SelectionChip';
import { WorkspaceContentToolbar } from './WorkspaceContentToolbar';
import { createPortableWorkspaceView } from '../../domain/portableWorkspaceView';
import type { BrowserSnapshotView, NativeGroupId, NativeTabId, NativeWindowId } from '../../domain/types';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import {
  WORKSPACE_SIDEBAR_DEFAULT_WIDTH,
  WorkspaceShell
} from './WorkspaceShell';
import {
  comparePortableWorkspaces,
  DEFAULT_SNAPSHOT_COMPARISON_FIELDS,
  type SnapshotComparisonField,
  type SnapshotTabDiff,
  type WorkspaceComparison
} from '../../domain/snapshotComparison';

interface SnapshotWorkspaceProps {
  actions: SnapshotActions;
  onClose: () => void;
  onBrowserRefresh: () => void | Promise<unknown>;
  currentContent?: ReactNode;
  currentContentToolbar?: ReactNode;
  currentSelectionChip?: ReactNode;
  currentViewOptions?: ReactNode;
  currentSummary?: string;
}

type SourceKind = 'named' | 'history';

interface SelectedSnapshot {
  source: SourceKind;
  label: string;
  snapshotId: string;
  workspace: PortableWorkspace;
  checkpointId?: string;
  operationId?: string;
  phase?: 'before' | 'after';
}

interface RestoreTarget {
  checkpointId?: string;
  snapshotId?: string;
  operationId?: string;
}

interface SnapshotRenameState {
  checkpointId: string;
  draft: string;
}

interface RestoreState {
  target: RestoreTarget;
  preview: RollbackPreview;
  closeExtraTabs: boolean;
}

interface ComparisonInput {
  snapshot: PortableWorkspace;
  current: PortableWorkspace;
}

const COMPARISON_FIELD_OPTIONS: Array<{ field: SnapshotComparisonField; label: string }> = [
  { field: 'url', label: 'URL' },
  { field: 'title', label: 'Title' },
  { field: 'pinned', label: 'Pinned state' },
  { field: 'window', label: 'Window' },
  { field: 'group', label: 'Group' },
  { field: 'position', label: 'Position' }
];

const EMPTY_BROWSER_SNAPSHOT_VIEW: BrowserSnapshotView = { windows: [] };

export function SnapshotWorkspace({ actions, onClose, onBrowserRefresh, currentContent, currentContentToolbar, currentSelectionChip, currentViewOptions, currentSummary }: SnapshotWorkspaceProps) {
  const [namedSnapshots, setNamedSnapshots] = useState<NamedSnapshot[]>([]);
  const [history, setHistory] = useState<OperationRecord[]>([]);
  const [activeSection, setActiveSection] = useState<SourceKind>('named');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(WORKSPACE_SIDEBAR_DEFAULT_WIDTH);
  const [workspaceMode, setWorkspaceMode] = useState<'current' | 'snapshot' | 'comparison'>(currentContent ? 'current' : 'snapshot');
  const [selected, setSelected] = useState<SelectedSnapshot>();
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [windowScope, setWindowScope] = useState<WindowScope>({ kind: 'all' });
  const [groupStatus, setGroupStatus] = useState<GroupStatusFilter>('all');
  const [pinnedStatus, setPinnedStatus] = useState<PinnedStatusFilter>('all');
  const [groupId, setGroupId] = useState<NativeGroupId | 'all'>('all');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<NativeGroupId>>(new Set());
  const [collapsedWindowIds, setCollapsedWindowIds] = useState<Set<NativeWindowId>>(new Set());
  const selectedWorkspaceView = useMemo(() => selected ? createPortableWorkspaceView(selected.workspace) : undefined, [selected]);
  const selectedViewTabIds = useMemo(() => new Set(
    [...selectedTabIds].flatMap((localId) => {
      const id = selectedWorkspaceView?.tabIdByLocalId.get(localId);
      return id === undefined ? [] : [id];
    })
  ), [selectedTabIds, selectedWorkspaceView]);
  const filteredSnapshotView = useMemo(() => selectedWorkspaceView ? applyTabFilters(selectedWorkspaceView.view, { search, windowScope, groupStatus, pinnedStatus, groupId, duplicatesOnly }) : undefined, [duplicatesOnly, groupId, groupStatus, pinnedStatus, search, selectedWorkspaceView, windowScope]);
  const visibleSnapshotTabIds = useMemo(() => filteredSnapshotView?.windows.flatMap((window) => window.items.map((item) => item.tab.id)) ?? [], [filteredSnapshotView]);
  const allVisibleSnapshotTabsSelected = visibleSnapshotTabIds.length > 0 && visibleSnapshotTabIds.every((tabId) => selectedViewTabIds.has(tabId));
  const toggleVisibleSnapshotSelection = useCallback(() => {
    setSelectedViewTabIds((current) => {
      const next = new Set(current);
      visibleSnapshotTabIds.forEach((tabId) => {
        if (allVisibleSnapshotTabsSelected) next.delete(tabId);
        else next.add(tabId);
      });
      return next;
    });
  }, [allVisibleSnapshotTabsSelected, visibleSnapshotTabIds]);
  const setSelectedViewTabIds = useCallback<React.Dispatch<React.SetStateAction<Set<NativeTabId>>>>((value) => {
    setSelectedTabIds((currentLocalIds) => {
      const currentViewIds = new Set([...currentLocalIds].flatMap((localId) => {
        const id = selectedWorkspaceView?.tabIdByLocalId.get(localId);
        return id === undefined ? [] : [id];
      }));
      const nextViewIds = typeof value === 'function' ? value(currentViewIds) : value;
      return new Set([...nextViewIds].flatMap((id) => {
        const localId = selectedWorkspaceView?.tabLocalIdById.get(id);
        return localId === undefined ? [] : [localId];
      }));
    });
  }, [selectedWorkspaceView]);
  const [namedSnapshotMenu, setNamedSnapshotMenu] = useState<NamedSnapshotContextMenuState>();
  const [renameState, setRenameState] = useState<SnapshotRenameState>();
  const [comparisonInput, setComparisonInput] = useState<ComparisonInput>();
  const [comparisonFields, setComparisonFields] = useState<SnapshotComparisonField[]>([...DEFAULT_SNAPSHOT_COMPARISON_FIELDS]);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const comparison = useMemo<WorkspaceComparison | undefined>(() => (
    comparisonInput
      ? comparePortableWorkspaces(comparisonInput.snapshot, comparisonInput.current, { changedFields: comparisonFields })
      : undefined
  ), [comparisonFields, comparisonInput]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [importPreview, setImportPreview] = useState<{ workspace: PortableWorkspace; mode: WorkspaceImportMode; preview: WorkspaceImportPreview }>();
  const [restorePreview, setRestorePreview] = useState<RestoreState>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLists = useCallback(async () => {
    setLoading(true);
    setMessage(undefined);
    try {
      const [nextNamed, nextHistory] = await Promise.all([
        actions.listNamedSnapshots(),
        actions.listOperationHistory()
      ]);
      setNamedSnapshots(nextNamed);
      setHistory(nextHistory);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [actions]);

  useEffect(() => { void loadLists(); }, [loadLists]);

  const selectNamed = useCallback((item: NamedSnapshot) => {
    setWorkspaceMode('snapshot');
    setSelected({
      source: 'named',
      label: item.checkpoint.name,
      snapshotId: item.snapshot.snapshotId,
      workspace: item.snapshot.workspace,
      checkpointId: item.checkpoint.checkpointId
    });
    setSelectedTabIds(new Set());
    setComparisonInput(undefined);
    setRestorePreview(undefined);
    setImportPreview(undefined);
  }, []);

  const selectHistory = useCallback(async (operation: OperationRecord, phase: 'before' | 'after') => {
    setBusy(true);
    setMessage(undefined);
    try {
      const item = await actions.getOperationSnapshot(operation.operationId, phase);
      if (!item) throw new Error(`The ${phase} snapshot is unavailable.`);
      setWorkspaceMode('snapshot');
      setSelected(toSelectedSnapshot(item));
      setSelectedTabIds(new Set());
      setComparisonInput(undefined);
      setRestorePreview(undefined);
      setImportPreview(undefined);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions]);

  const handleRename = useCallback(async (item: NamedSnapshot, name: string) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const renamed = await actions.renameNamedSnapshot(item.checkpoint.checkpointId, name);
      setNamedSnapshots((current) => current.map((candidate) => candidate.checkpoint.checkpointId === renamed.checkpoint.checkpointId ? renamed : candidate));
      setSelected((current) => current?.checkpointId === renamed.checkpoint.checkpointId ? { ...current, label: renamed.checkpoint.name } : current);
      setRenameState(undefined);
      setNamedSnapshotMenu(undefined);
      setMessage(`Renamed snapshot to “${renamed.checkpoint.name}”.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions]);

  const handleDelete = useCallback(async (item: NamedSnapshot) => {
    if (!window.confirm(`Delete named snapshot “${item.checkpoint.name}”? The operation history and underlying workspace data will remain available.`)) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await actions.deleteNamedSnapshot(item.checkpoint.checkpointId);
      setNamedSnapshots((current) => current.filter((candidate) => candidate.checkpoint.checkpointId !== item.checkpoint.checkpointId));
      setSelected((current) => current?.checkpointId === item.checkpoint.checkpointId ? undefined : current);
      setWorkspaceMode((current) => current === 'snapshot' && selected?.checkpointId === item.checkpoint.checkpointId ? 'current' : current);
      setNamedSnapshotMenu(undefined);
      setRenameState(undefined);
      setMessage(`Deleted snapshot “${item.checkpoint.name}”.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions]);

  const requestRename = useCallback((item: NamedSnapshot) => {
    selectNamed(item);
    setNamedSnapshotMenu(undefined);
    setRenameState({ checkpointId: item.checkpoint.checkpointId, draft: item.checkpoint.name });
  }, [selectNamed]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const item = await actions.createNamedSnapshot();
      setNamedSnapshots((current) => [item, ...current]);
      selectNamed(item);
      setMessage(`Saved snapshot “${item.checkpoint.name}”.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions, selectNamed]);

  const handleOpenSelected = useCallback(async () => {
    if (!selected || selectedTabIds.size === 0) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const localIds = [...selectedTabIds].filter((localId) => selectedWorkspaceView?.tabIdByLocalId.has(localId));
      const created = await actions.openSnapshotTabs(selected.workspace, localIds);
      await onBrowserRefresh();
      setMessage(`Opened ${created.length} snapshot tab${created.length === 1 ? '' : 's'} in the focused window.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions, onBrowserRefresh, selected, selectedTabIds, selectedWorkspaceView]);

  const handleCompare = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const current = await actions.getCurrentWorkspace();
      setShowUnchanged(false);
      setWorkspaceMode('comparison');
      setComparisonInput({ snapshot: selected.workspace, current });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions, selected]);

  const handleExport = useCallback(() => {
    if (!selected) return;
    downloadJson(`${safeFileName(selected.label)}.json`, actions.exportWorkspace(selected.workspace));
    setMessage(`Exported “${selected.label}”.`);
  }, [actions, selected]);

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const workspace = JSON.parse(await file.text()) as PortableWorkspace;
      const mode: WorkspaceImportMode = 'append';
      const preview = await actions.previewImport(workspace, mode);
      setImportPreview({ workspace, mode, preview });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions]);

  const handleImport = useCallback(async () => {
    if (!importPreview) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await actions.importWorkspace(importPreview.workspace, importPreview.mode);
      await onBrowserRefresh();
      setImportPreview(undefined);
      await loadLists();
      setMessage(`Imported ${Object.keys(result.tabIdMap).length} tab${Object.keys(result.tabIdMap).length === 1 ? '' : 's'}.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions, importPreview, loadLists, onBrowserRefresh]);

  const prepareRestore = useCallback(async (target: RestoreTarget, closeExtraTabs = false) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const preview = await actions.previewRollback(target, closeExtraTabs);
      setRestorePreview({ target, preview, closeExtraTabs });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions]);

  const handleRestore = useCallback(async () => {
    if (!restorePreview) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await actions.rollback(restorePreview.target, restorePreview.closeExtraTabs);
      await onBrowserRefresh();
      setRestorePreview(undefined);
      await loadLists();
      setMessage(`Restored snapshot with ${result.changes.length} browser change${result.changes.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions, loadLists, onBrowserRefresh, restorePreview]);

  const workspaceTitle = workspaceMode === 'current' ? 'Current' : workspaceMode === 'comparison' ? 'Compare' : selected?.label ?? 'Snapshot';
  const snapshotToolbar = workspaceMode === 'current' ? (
    <>
      <div className="workspace-toolbar-title">
        <div className="workspace-toolbar-name"><h1>Current</h1>{currentSelectionChip}</div>
        {currentSummary ? <p className="workspace-toolbar-meta">{currentSummary}</p> : null}
      </div>
      <div className="workspace-toolbar-actions">
        {currentViewOptions}
        <button className="primary-button" type="button" disabled={busy} onClick={() => void handleSave()}><Archive aria-hidden="true" size={15} /> Save current snapshot</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}><Upload aria-hidden="true" size={15} /> Import JSON</button>
      </div>
    </>
  ) : workspaceMode === 'comparison' ? (
    <>
      <div className="workspace-toolbar-title"><p className="eyebrow">Read-only diff</p><h1>Compare</h1></div>
      <div className="workspace-toolbar-actions"><button className="secondary-button" type="button" onClick={() => { setComparisonInput(undefined); setWorkspaceMode('snapshot'); }}><ChevronRight aria-hidden="true" size={15} /> Back to snapshot</button></div>
    </>
  ) : (
    <>
      <div className="workspace-toolbar-title">
        {renameState && selected?.checkpointId === renameState.checkpointId ? <EditableSnapshotName draft={renameState.draft} onCancel={() => setRenameState(undefined)} onChange={(draft) => setRenameState((current) => current ? { ...current, draft } : current)} onSave={(name) => { const item = namedSnapshots.find((candidate) => candidate.checkpoint.checkpointId === selected.checkpointId); if (item) void handleRename(item, name); }} /> : <div className="workspace-toolbar-name"><h1>{workspaceTitle}</h1>{selected?.source === 'named' && selected.checkpointId ? <button aria-label={`Rename ${selected.label}`} className="icon-button snapshot-name-edit-button" type="button" onClick={() => setRenameState({ checkpointId: selected.checkpointId!, draft: selected.label })}><Pencil aria-hidden="true" size={14} /></button> : null}{selected ? <SelectionChip count={selectedTabIds.size} onClear={() => setSelectedTabIds(new Set())} /> : null}</div>}
        {selected ? <p className="workspace-toolbar-meta">{workspaceSummary(selected.workspace)} · {selected.snapshotId}</p> : null}
      </div>
      <div className="workspace-toolbar-actions">
        {selected ? <button className="secondary-button" type="button" disabled={busy || visibleSnapshotTabIds.length === 0} onClick={toggleVisibleSnapshotSelection}>{allVisibleSnapshotTabsSelected ? 'Clear all' : 'Select all'}</button> : null}
        <button className="secondary-button" type="button" disabled={busy || selectedTabIds.size === 0} onClick={() => void handleOpenSelected()}><ExternalLink aria-hidden="true" size={14} /> Open selected</button>
        <button className="secondary-button" type="button" disabled={busy || !selected} onClick={() => void handleCompare()}><GitCompare aria-hidden="true" size={14} /> Compare</button>
        <button className="secondary-button" type="button" disabled={busy || !selected} onClick={handleExport}><Download aria-hidden="true" size={14} /> Export</button>
        <button className="secondary-button" type="button" disabled={busy || !selected} onClick={() => selected && void prepareRestore(selected.source === 'named' ? { checkpointId: selected.checkpointId } : { snapshotId: selected.snapshotId })}><RotateCcw aria-hidden="true" size={14} /> Restore</button>
      </div>
    </>
  );

  const sidebar = (
    <>
      <button className={`workspace-nav-item workspace-current-item ${workspaceMode === 'current' ? 'is-selected' : ''}`} type="button" onClick={() => { setWorkspaceMode('current'); setComparisonInput(undefined); }}>
        <span className="workspace-nav-item-title">Current</span>
      </button>
      <div className="workspace-sidebar-heading"><h2>Snapshots</h2><span className="snapshot-pill">{namedSnapshots.length + history.length}</span></div>
      <div className="snapshot-section-tabs" role="tablist" aria-label="Snapshot source">
        <button type="button" role="tab" aria-selected={activeSection === 'named'} onClick={() => setActiveSection('named')}>Name <span>{namedSnapshots.length}</span></button>
        <button type="button" role="tab" aria-selected={activeSection === 'history'} onClick={() => setActiveSection('history')}>History <span>{history.length}</span></button>
      </div>
      <div className="workspace-sidebar-snapshot-list">
        {activeSection === 'named' ? (
          <NamedSnapshotList items={namedSnapshots} selectedId={selected?.checkpointId} onSelect={selectNamed} onContextMenu={(item, event) => { event.preventDefault(); selectNamed(item); setNamedSnapshotMenu({ item, x: event.clientX, y: event.clientY }); }} />
        ) : (
          <OperationHistoryList items={history} selectedId={selected?.operationId} onSelect={(operation, phase) => void selectHistory(operation, phase)} />
        )}
      </div>
    </>
  );

  const content = workspaceMode === 'current' ? currentContent ?? <p className="empty-state">Current workspace is shown in the manager page.</p> : comparison ? (
    <ComparisonPanel comparison={comparison} selectedFields={comparisonFields} showUnchanged={showUnchanged} onSelectedFieldsChange={setComparisonFields} onShowUnchangedChange={setShowUnchanged} onBack={() => { setComparisonInput(undefined); setWorkspaceMode('snapshot'); }} />
  ) : selected ? (
    <SnapshotDetail view={filteredSnapshotView} selectedTabIds={selectedViewTabIds} setSelectedTabIds={setSelectedViewTabIds} collapsedGroupIds={collapsedGroupIds} collapsedWindowIds={collapsedWindowIds} onToggleGroup={(groupId) => setCollapsedGroupIds((current) => toggleSetValue(current, groupId))} onToggleWindow={(windowId) => setCollapsedWindowIds((current) => toggleSetValue(current, windowId))} />
  ) : (
    <div className="snapshot-empty-detail"><GitCompare aria-hidden="true" size={28} /><h3>Select a snapshot</h3><p>Choose a named snapshot or an operation-history state to inspect its tabs.</p></div>
  );

  const snapshotContentToolbar = workspaceMode === 'snapshot' ? (
    <WorkspaceContentToolbar
      view={filteredSnapshotView ?? EMPTY_BROWSER_SNAPSHOT_VIEW}
      optionView={selectedWorkspaceView?.view ?? EMPTY_BROWSER_SNAPSHOT_VIEW}
      search={search}
      onSearchChange={setSearch}
      windowScope={windowScope}
      onWindowScopeChange={setWindowScope}
      groupStatus={groupStatus}
      onGroupStatusChange={setGroupStatus}
      pinnedStatus={pinnedStatus}
      onPinnedStatusChange={setPinnedStatus}
      groupId={groupId}
      onGroupIdChange={setGroupId}
      duplicatesOnly={duplicatesOnly}
      onDuplicatesOnlyChange={setDuplicatesOnly}
    />
  ) : null;
  const contentToolbar = workspaceMode === 'current' ? currentContentToolbar : snapshotContentToolbar;

  return (
    <>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void handleImportFile(event)} />
      {message ? <p className="snapshot-message" role="status">{message}</p> : null}
      {loading ? <p className="empty-state">Loading snapshots...</p> : null}
      {!loading ? <WorkspaceShell
        sidebar={sidebar}
        toolbar={snapshotToolbar}
        contentToolbar={contentToolbar}
        sidebarCollapsed={sidebarCollapsed}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      >{content}{importPreview ? <ImportPreviewPanel state={importPreview} busy={busy} onCancel={() => setImportPreview(undefined)} onConfirm={() => void handleImport()} onModeChange={async (mode) => { try { setBusy(true); setImportPreview({ ...importPreview, mode, preview: await actions.previewImport(importPreview.workspace, mode) }); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); } }} /> : null}{restorePreview ? <RestorePreviewPanel state={restorePreview} busy={busy} onCancel={() => setRestorePreview(undefined)} onConfirm={() => void handleRestore()} onCloseExtraTabsChange={(closeExtraTabs) => void prepareRestore(restorePreview.target, closeExtraTabs)} /> : null}{namedSnapshotMenu ? <NamedSnapshotContextMenu menu={namedSnapshotMenu} onClose={() => setNamedSnapshotMenu(undefined)} onRename={() => requestRename(namedSnapshotMenu.item)} onDelete={() => void handleDelete(namedSnapshotMenu.item)} /> : null}</WorkspaceShell> : null}
    </>
  );
}

function NamedSnapshotList({ items, selectedId, onSelect, onContextMenu }: {
  items: NamedSnapshot[];
  selectedId?: string;
  onSelect: (item: NamedSnapshot) => void;
  onContextMenu: (item: NamedSnapshot, event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (items.length === 0) return <p className="snapshot-list-empty">No named snapshots yet.</p>;
  return <div className="snapshot-list">{items.map((item) => <button
    key={item.checkpoint.checkpointId}
    type="button"
    className={`snapshot-list-item ${selectedId === item.checkpoint.checkpointId ? 'is-selected' : ''}`}
    onClick={() => onSelect(item)}
    onContextMenu={(event) => onContextMenu(item, event)}
  >
    <span className="snapshot-list-item-title">{item.checkpoint.name}</span>
    <span className="snapshot-list-item-meta">{workspaceSummary(item.snapshot.workspace)} · {formatDate(item.checkpoint.createdAt)}</span>
  </button>)}</div>;
}

function OperationHistoryList({ items, selectedId, onSelect }: { items: OperationRecord[]; selectedId?: string; onSelect: (operation: OperationRecord, phase: 'before' | 'after') => void }) {
  if (items.length === 0) return <p className="snapshot-list-empty">No operation history yet.</p>;
  const [limit, setLimit] = useState(160);
  const visible = items.slice(0, limit);
  return <div className="snapshot-list">{visible.map((operation) => <div key={operation.operationId} className={`snapshot-history-item ${selectedId === operation.operationId ? 'is-selected' : ''}`}>
    <div className="snapshot-history-title">{operation.operationType}<span className={`snapshot-status status-${operation.status}`}>{operation.status}</span></div>
    <span className="snapshot-list-item-meta">{operation.source} · {formatDate(operation.requestedAt)}</span>
    <div className="snapshot-history-actions">
      <button type="button" onClick={() => onSelect(operation, 'before')}>Before</button>
      {operation.afterSnapshotId ? <button type="button" onClick={() => onSelect(operation, 'after')}>After</button> : null}
    </div>
  </div>)}</div>;
}

function SnapshotDetail({ view, selectedTabIds, setSelectedTabIds, collapsedGroupIds, collapsedWindowIds, onToggleGroup, onToggleWindow }: {
  view?: BrowserSnapshotView;
  selectedTabIds: Set<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  collapsedWindowIds: ReadonlySet<NativeWindowId>;
  onToggleGroup: (groupId: NativeGroupId) => void;
  onToggleWindow: (windowId: NativeWindowId) => void;
}) {
  return <>
    {view ? <WorkspaceCanvas
      view={view}
      readOnly
      collapsedGroupIds={collapsedGroupIds}
      collapsedWindowIds={collapsedWindowIds}
      contextSourceTabId={undefined}
      defaultWindowName={(_, index) => `Window ${index + 1}`}
      dragEnabled={false}
      onActivateTab={() => undefined}
      onCloseTab={() => undefined}
      onOpenGroupMenu={() => undefined}
      onOpenTabContextMenu={() => undefined}
      onSelectTab={(tabId) => setSelectedTabIds((current) => toggleSetValue(current, tabId))}
      onSortableChange={() => undefined}
      onSortableStart={() => undefined}
      onToggleGroup={onToggleGroup}
      onToggleWindow={onToggleWindow}
      onUpdateWindowName={() => undefined}
      selectedTabIds={selectedTabIds}
      setSelectedTabIds={setSelectedTabIds}
    /> : <p className="empty-state">Snapshot workspace is unavailable.</p>}
  </>;
}

function EditableSnapshotName({ draft, onCancel, onChange, onSave }: {
  draft: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const save = () => {
    const name = draft.trim();
    if (name) onSave(name);
  };
  return <div className="snapshot-name-edit">
    <input ref={inputRef} aria-label="Named snapshot name" value={draft} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); save(); }
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    }} />
    <button aria-label="Save snapshot name" className="icon-button" type="button" onClick={save}><Check aria-hidden="true" size={14} /></button>
    <button aria-label="Cancel snapshot rename" className="icon-button" type="button" onClick={onCancel}><X aria-hidden="true" size={14} /></button>
  </div>;
}

function ComparisonPanel({ comparison, selectedFields, showUnchanged, onSelectedFieldsChange, onShowUnchangedChange, onBack }: {
  comparison: WorkspaceComparison;
  selectedFields: SnapshotComparisonField[];
  showUnchanged: boolean;
  onSelectedFieldsChange: (fields: SnapshotComparisonField[]) => void;
  onShowUnchangedChange: (value: boolean) => void;
  onBack: () => void;
}) {
  const visible = showUnchanged ? comparison.diffs : comparison.diffs.filter((diff) => diff.kind !== 'unchanged');
  return <section className="snapshot-subpanel comparison-panel" aria-labelledby="snapshot-comparison-title">
    <div className="snapshot-subpanel-header">
      <div><p className="eyebrow">Read-only diff</p><h3 id="snapshot-comparison-title">Snapshot vs current</h3></div>
      <button className="secondary-button" type="button" onClick={onBack}>Back to snapshot</button>
    </div>
    <fieldset className="comparison-options">
      <legend>Count as changed</legend>
      <p className="comparison-options-help">Matching still uses URL first and title second. These choices decide which differences receive the “changed” status. Position is off by default.</p>
      <div className="comparison-option-list">{COMPARISON_FIELD_OPTIONS.map(({ field, label }) => <label key={field} className="snapshot-option">
        <input
          type="checkbox"
          checked={selectedFields.includes(field)}
          onChange={(event) => onSelectedFieldsChange(event.target.checked ? [...selectedFields, field] : selectedFields.filter((item) => item !== field))}
        />
        {label}
      </label>)}</div>
    </fieldset>
    <label className="snapshot-option comparison-show-unchanged"><input type="checkbox" checked={showUnchanged} onChange={(event) => onShowUnchangedChange(event.target.checked)} /> Show unchanged</label>
    <div className="comparison-summary">{(['snapshot-only', 'current-only', 'changed', 'unchanged'] as const).map((kind) => <span key={kind} className={`comparison-count diff-${kind}`}>{kind}: {comparison.summary[kind]}</span>)}</div>
    {visible.length > 0 ? <div className="comparison-diff-list">{visible.map((diff, index) => <ComparisonDiffRow key={`${diff.kind}-${index}`} diff={diff} />)}</div> : <p className="comparison-empty">No selected differences.</p>}
  </section>;
}

function ComparisonDiffRow({ diff }: { diff: SnapshotTabDiff }) {
  return <article className={`comparison-diff-row diff-${diff.kind}`}>
    <div className="comparison-diff-context">{formatDiffContext(diff)}</div>
    <div className="comparison-diff-columns">
      <ComparisonDiffSide label="Snapshot" entry={diff.snapshot} />
      <ComparisonDiffSide label="Current" entry={diff.current} />
    </div>
    <p className="comparison-diff-details">{diff.details.join(' ')}</p>
  </article>;
}

function ComparisonDiffSide({ label, entry }: { label: string; entry: SnapshotTabDiff['snapshot'] }) {
  return <div className="comparison-diff-side">
    <span className="comparison-diff-side-label">{label}</span>
    {entry ? <><strong>{entry.tab.title || entry.tab.url || 'Untitled tab'}</strong><span>{entry.tab.url || entry.tab.pendingUrl || 'No URL'}</span></> : <span className="comparison-diff-placeholder">No matching tab</span>}
  </div>;
}

function formatDiffContext(diff: SnapshotTabDiff) {
  const entry = diff.snapshot ?? diff.current;
  if (!entry) return 'Unknown workspace location';
  const window = `Window ${entry.location.windowIndex + 1}`;
  return entry.location.groupTitle ? `${window} · ${entry.location.groupTitle}` : window;
}

function ImportPreviewPanel({ state, busy, onCancel, onConfirm, onModeChange }: { state: { workspace: PortableWorkspace; mode: WorkspaceImportMode; preview: WorkspaceImportPreview }; busy: boolean; onCancel: () => void; onConfirm: () => void; onModeChange: (mode: WorkspaceImportMode) => void }) {
  return <section className="snapshot-subpanel snapshot-confirm-panel" aria-labelledby="snapshot-import-title"><div className="snapshot-subpanel-header"><div><p className="eyebrow">Import preview</p><h3 id="snapshot-import-title">Review workspace import</h3></div><select aria-label="Import mode" value={state.mode} disabled={busy} onChange={(event) => void onModeChange(event.target.value as WorkspaceImportMode)}><option value="append">Append</option><option value="replace">Replace</option></select></div><p>{state.preview.items.length} planned changes · {state.preview.warnings.length} warnings</p><ul>{state.preview.items.slice(0, 12).map((item) => <li key={`${item.kind}-${item.localId}`}>{item.message}</li>)}</ul><div className="snapshot-confirm-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary-button" type="button" disabled={busy || !state.preview.valid} onClick={onConfirm}><Check aria-hidden="true" size={14} /> Confirm import</button></div></section>;
}

function RestorePreviewPanel({ state, busy, onCancel, onConfirm, onCloseExtraTabsChange }: { state: RestoreState; busy: boolean; onCancel: () => void; onConfirm: () => void; onCloseExtraTabsChange: (value: boolean) => void }) {
  return <section className="snapshot-subpanel snapshot-confirm-panel" aria-labelledby="snapshot-restore-title"><div className="snapshot-subpanel-header"><div><p className="eyebrow">Restore preview</p><h3 id="snapshot-restore-title">Review workspace restore</h3></div><span className="snapshot-pill">{state.preview.changes.length} changes</span></div><p>{state.preview.targetWindowCount} windows · {state.preview.targetTabCount} tabs · {state.preview.targetGroupCount} groups</p><label className="snapshot-option"><input type="checkbox" checked={state.closeExtraTabs} disabled={busy} onChange={(event) => onCloseExtraTabsChange(event.target.checked)} /> Close tabs that are not in this snapshot</label><ul>{state.preview.changes.slice(0, 12).map((change, index) => <li key={`${change.kind}-${change.nativeId ?? change.targetLocalId ?? index}`}>{change.message}</li>)}</ul>{state.preview.warnings.length > 0 ? <p className="snapshot-warning">{state.preview.warnings.join(' ')}</p> : null}<div className="snapshot-confirm-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary-button" type="button" disabled={busy} onClick={onConfirm}><RotateCcw aria-hidden="true" size={14} /> Confirm restore</button></div></section>;
}

function toSelectedSnapshot(item: OperationSnapshot): SelectedSnapshot {
  return { source: 'history', label: `${formatDate(item.operation.requestedAt)} · ${item.operation.operationType} · ${item.phase}`, snapshotId: item.snapshot.snapshotId, workspace: item.snapshot.workspace, operationId: item.operation.operationId, phase: item.phase };
}

function toggleSetValue<T>(current: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

function workspaceSummary(workspace: PortableWorkspace) {
  const tabs = workspace.windows.reduce((sum, window) => sum + window.tabs.length, 0);
  const groups = workspace.windows.reduce((sum, window) => sum + window.groups.length, 0);
  return `${workspace.windows.length} windows · ${tabs} tabs · ${groups} groups`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9-_ ]/gi, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'snapshot';
}

function downloadJson(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Snapshot operation failed.';
}
