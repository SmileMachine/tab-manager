import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Check, ChevronRight, Download, ExternalLink, GitCompare, RotateCcw, Upload, X } from 'lucide-react';

import type { OperationRecord, PortableWorkspace, WorkspaceImportMode, WorkspaceImportPreview, RollbackPreview } from '../../codex/protocol';
import type { NamedSnapshot, OperationSnapshot, SnapshotActions } from '../application/snapshotActions';
import { comparePortableWorkspaces, type SnapshotTabEntry, type SnapshotTabDiff, type WorkspaceComparison } from '../../domain/snapshotComparison';

interface SnapshotWorkspaceProps {
  actions: SnapshotActions;
  onClose: () => void;
  onBrowserRefresh: () => void | Promise<unknown>;
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

export function SnapshotWorkspace({ actions, onClose, onBrowserRefresh }: SnapshotWorkspaceProps) {
  const [namedSnapshots, setNamedSnapshots] = useState<NamedSnapshot[]>([]);
  const [history, setHistory] = useState<OperationRecord[]>([]);
  const [activeSection, setActiveSection] = useState<SourceKind>('named');
  const [selected, setSelected] = useState<SelectedSnapshot>();
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<WorkspaceComparison>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [importPreview, setImportPreview] = useState<{ workspace: PortableWorkspace; mode: WorkspaceImportMode; preview: WorkspaceImportPreview }>();
  const [restorePreview, setRestorePreview] = useState<{ target: RestoreTarget; preview: RollbackPreview }>();
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
    setSelected({
      source: 'named',
      label: item.checkpoint.name,
      snapshotId: item.snapshot.snapshotId,
      workspace: item.snapshot.workspace,
      checkpointId: item.checkpoint.checkpointId
    });
    setSelectedTabIds(new Set());
    setComparison(undefined);
    setRestorePreview(undefined);
    setImportPreview(undefined);
  }, []);

  const selectHistory = useCallback(async (operation: OperationRecord, phase: 'before' | 'after') => {
    setBusy(true);
    setMessage(undefined);
    try {
      const item = await actions.getOperationSnapshot(operation.operationId, phase);
      if (!item) throw new Error(`The ${phase} snapshot is unavailable.`);
      setSelected(toSelectedSnapshot(item));
      setSelectedTabIds(new Set());
      setComparison(undefined);
      setRestorePreview(undefined);
      setImportPreview(undefined);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions]);

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
      const created = await actions.openSnapshotTabs(selected.workspace, [...selectedTabIds]);
      await onBrowserRefresh();
      setMessage(`Opened ${created.length} snapshot tab${created.length === 1 ? '' : 's'} in the focused window.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [actions, onBrowserRefresh, selected, selectedTabIds]);

  const handleCompare = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const current = await actions.getCurrentWorkspace();
      setComparison(comparePortableWorkspaces(selected.workspace, current));
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

  const prepareRestore = useCallback(async (target: RestoreTarget) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const preview = await actions.previewRollback(target, false);
      setRestorePreview({ target, preview });
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
      const result = await actions.rollback(restorePreview.target, false);
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

  return (
    <section className="snapshot-workspace" aria-labelledby="snapshot-workspace-title">
      <div className="snapshot-workspace-header">
        <div>
          <p className="eyebrow">Workspace versions</p>
          <h2 id="snapshot-workspace-title">Snapshots</h2>
          <p className="snapshot-workspace-description">Save, inspect, compare, and reopen parts of a browser workspace.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close snapshots" onClick={onClose}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="snapshot-toolbar" aria-label="Snapshot actions">
        <button className="primary-button" type="button" disabled={busy} onClick={() => void handleSave()}>
          <Archive aria-hidden="true" size={15} /> Save current snapshot
        </button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden="true" size={15} /> Import JSON
        </button>
        <input ref={fileInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void handleImportFile(event)} />
      </div>

      {message ? <p className="snapshot-message" role="status">{message}</p> : null}
      {loading ? <p className="empty-state">Loading snapshots...</p> : null}

      {!loading ? (
        <div className="snapshot-layout">
          <aside className="snapshot-list-panel" aria-label="Snapshot sources">
            <div className="snapshot-section-tabs" role="tablist" aria-label="Snapshot source">
              <button type="button" role="tab" aria-selected={activeSection === 'named'} onClick={() => setActiveSection('named')}>
                Named <span>{namedSnapshots.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={activeSection === 'history'} onClick={() => setActiveSection('history')}>
                History <span>{history.length}</span>
              </button>
            </div>
            {activeSection === 'named' ? (
              <NamedSnapshotList items={namedSnapshots} selectedId={selected?.checkpointId} onSelect={selectNamed} />
            ) : (
              <OperationHistoryList items={history} selectedId={selected?.operationId} onSelect={(operation, phase) => void selectHistory(operation, phase)} />
            )}
          </aside>

          <div className="snapshot-detail-panel">
            {selected ? (
              <SnapshotDetail
                selected={selected}
                selectedTabIds={selectedTabIds}
                onSelectionChange={setSelectedTabIds}
                onOpenSelected={() => void handleOpenSelected()}
                onExport={handleExport}
                onCompare={() => void handleCompare()}
                onRestore={() => void prepareRestore(selected.source === 'named' ? { checkpointId: selected.checkpointId } : { snapshotId: selected.snapshotId })}
                busy={busy}
              />
            ) : (
              <div className="snapshot-empty-detail">
                <GitCompare aria-hidden="true" size={28} />
                <h3>Select a snapshot</h3>
                <p>Choose a named snapshot or an operation-history state to inspect its tabs.</p>
              </div>
            )}

            {comparison ? <ComparisonPanel comparison={comparison} /> : null}
            {importPreview ? <ImportPreviewPanel state={importPreview} busy={busy} onCancel={() => setImportPreview(undefined)} onConfirm={() => void handleImport()} onModeChange={async (mode) => {
              try {
                setBusy(true);
                setImportPreview({ ...importPreview, mode, preview: await actions.previewImport(importPreview.workspace, mode) });
              } catch (error) {
                setMessage(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }} /> : null}
            {restorePreview ? <RestorePreviewPanel state={restorePreview.preview} busy={busy} onCancel={() => setRestorePreview(undefined)} onConfirm={() => void handleRestore()} /> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function NamedSnapshotList({ items, selectedId, onSelect }: { items: NamedSnapshot[]; selectedId?: string; onSelect: (item: NamedSnapshot) => void }) {
  if (items.length === 0) return <p className="snapshot-list-empty">No named snapshots yet.</p>;
  return <div className="snapshot-list">{items.map((item) => <button key={item.checkpoint.checkpointId} type="button" className={`snapshot-list-item ${selectedId === item.checkpoint.checkpointId ? 'is-selected' : ''}`} onClick={() => onSelect(item)}>
    <span className="snapshot-list-item-title">{item.checkpoint.name}</span>
    <span className="snapshot-list-item-meta">{workspaceSummary(item.snapshot.workspace)} · {formatDate(item.checkpoint.createdAt)}</span>
  </button>)}</div>;
}

function OperationHistoryList({ items, selectedId, onSelect }: { items: OperationRecord[]; selectedId?: string; onSelect: (operation: OperationRecord, phase: 'before' | 'after') => void }) {
  if (items.length === 0) return <p className="snapshot-list-empty">No operation history yet.</p>;
  const visible = items.slice(0, 160);
  return <div className="snapshot-list">{visible.map((operation) => <div key={operation.operationId} className={`snapshot-history-item ${selectedId === operation.operationId ? 'is-selected' : ''}`}>
    <div className="snapshot-history-title">{operation.operationType}<span className={`snapshot-status status-${operation.status}`}>{operation.status}</span></div>
    <span className="snapshot-list-item-meta">{operation.source} · {formatDate(operation.requestedAt)}</span>
    <div className="snapshot-history-actions">
      <button type="button" onClick={() => onSelect(operation, 'before')}>Before</button>
      {operation.afterSnapshotId ? <button type="button" onClick={() => onSelect(operation, 'after')}>After</button> : null}
    </div>
  </div>)}</div>;
}

function SnapshotDetail({ selected, selectedTabIds, onSelectionChange, onOpenSelected, onExport, onCompare, onRestore, busy }: {
  selected: SelectedSnapshot;
  selectedTabIds: Set<string>;
  onSelectionChange: (value: Set<string>) => void;
  onOpenSelected: () => void;
  onExport: () => void;
  onCompare: () => void;
  onRestore: () => void;
  busy: boolean;
}) {
  const tabs = flattenTabs(selected.workspace);
  const allSelected = tabs.length > 0 && tabs.every((entry) => selectedTabIds.has(entry.tab.localId));
  const toggleAll = () => onSelectionChange(allSelected ? new Set() : new Set(tabs.map((entry) => entry.tab.localId)));
  const toggle = (id: string) => {
    const next = new Set(selectedTabIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  return <div className="snapshot-detail">
    <div className="snapshot-detail-header">
      <div>
        <p className="eyebrow">{selected.source === 'named' ? 'Named snapshot' : `Operation history · ${selected.phase}`}</p>
        <h3>{selected.label}</h3>
        <p className="snapshot-list-item-meta">{workspaceSummary(selected.workspace)} · {selected.snapshotId}</p>
      </div>
      <div className="snapshot-detail-actions">
        <button className="secondary-button" type="button" disabled={busy || selectedTabIds.size === 0} onClick={onOpenSelected}><ExternalLink aria-hidden="true" size={14} /> Open selected</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={onCompare}><GitCompare aria-hidden="true" size={14} /> Compare</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={onExport}><Download aria-hidden="true" size={14} /> Export</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={onRestore}><RotateCcw aria-hidden="true" size={14} /> Restore workspace</button>
      </div>
    </div>
    <div className="snapshot-selection-bar">
      <label><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all tabs</label>
      <span>{selectedTabIds.size} selected</span>
    </div>
    <div className="snapshot-tab-list">
      {tabs.map((entry) => <label key={entry.tab.localId} className="snapshot-tab-item">
        <input type="checkbox" checked={selectedTabIds.has(entry.tab.localId)} onChange={() => toggle(entry.tab.localId)} />
        <span className="snapshot-tab-copy"><strong>{entry.tab.title || entry.tab.url || 'Untitled tab'}</strong><span>{entry.tab.url || entry.tab.pendingUrl || 'No URL'} · {entry.location.windowId}{entry.location.groupTitle ? ` · ${entry.location.groupTitle}` : ''}</span></span>
        {entry.tab.pinned ? <span className="snapshot-pill">Pinned</span> : null}
      </label>)}
    </div>
  </div>;
}

function ComparisonPanel({ comparison }: { comparison: WorkspaceComparison }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? comparison.diffs : comparison.diffs.slice(0, 80);
  return <section className="snapshot-subpanel" aria-labelledby="snapshot-comparison-title">
    <div className="snapshot-subpanel-header"><div><p className="eyebrow">Read-only analysis</p><h3 id="snapshot-comparison-title">Current vs snapshot</h3></div><span className="snapshot-pill">{comparison.diffs.length} differences and matches</span></div>
    <div className="comparison-summary">{(['snapshot-only', 'current-only', 'changed', 'ambiguous', 'unchanged'] as const).map((kind) => <span key={kind} className={`comparison-count diff-${kind}`}>{kind}: {comparison.summary[kind]}</span>)}</div>
    <div className="comparison-list">{visible.map((diff, index) => <ComparisonRow key={`${diff.kind}-${index}`} diff={diff} />)}</div>
    {comparison.diffs.length > 80 ? <button className="text-button" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show fewer' : `Show all ${comparison.diffs.length}`}</button> : null}
  </section>;
}

function ComparisonRow({ diff }: { diff: SnapshotTabDiff }) {
  const entry = diff.snapshot ?? diff.current;
  return <div className="comparison-row"><span className={`comparison-kind diff-${diff.kind}`}>{diff.kind}</span><div><strong>{entry?.tab.title || entry?.tab.url || 'Untitled tab'}</strong><p>{entry?.tab.url || entry?.tab.pendingUrl || 'No URL'} · {diff.details.join(' ')}</p></div></div>;
}

function ImportPreviewPanel({ state, busy, onCancel, onConfirm, onModeChange }: { state: { workspace: PortableWorkspace; mode: WorkspaceImportMode; preview: WorkspaceImportPreview }; busy: boolean; onCancel: () => void; onConfirm: () => void; onModeChange: (mode: WorkspaceImportMode) => void }) {
  return <section className="snapshot-subpanel snapshot-confirm-panel" aria-labelledby="snapshot-import-title"><div className="snapshot-subpanel-header"><div><p className="eyebrow">Import preview</p><h3 id="snapshot-import-title">Review workspace import</h3></div><select aria-label="Import mode" value={state.mode} disabled={busy} onChange={(event) => void onModeChange(event.target.value as WorkspaceImportMode)}><option value="append">Append</option><option value="replace">Replace</option></select></div><p>{state.preview.items.length} planned changes · {state.preview.warnings.length} warnings</p><ul>{state.preview.items.slice(0, 12).map((item) => <li key={`${item.kind}-${item.localId}`}>{item.message}</li>)}</ul><div className="snapshot-confirm-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary-button" type="button" disabled={busy || !state.preview.valid} onClick={onConfirm}><Check aria-hidden="true" size={14} /> Confirm import</button></div></section>;
}

function RestorePreviewPanel({ state, busy, onCancel, onConfirm }: { state: RollbackPreview; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <section className="snapshot-subpanel snapshot-confirm-panel" aria-labelledby="snapshot-restore-title"><div className="snapshot-subpanel-header"><div><p className="eyebrow">Restore preview</p><h3 id="snapshot-restore-title">Review workspace restore</h3></div><span className="snapshot-pill">{state.changes.length} changes</span></div><p>{state.targetWindowCount} windows · {state.targetTabCount} tabs · {state.targetGroupCount} groups</p><ul>{state.changes.slice(0, 12).map((change, index) => <li key={`${change.kind}-${change.nativeId ?? change.targetLocalId ?? index}`}>{change.message}</li>)}</ul>{state.warnings.length > 0 ? <p className="snapshot-warning">{state.warnings.join(' ')}</p> : null}<div className="snapshot-confirm-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary-button" type="button" disabled={busy} onClick={onConfirm}><RotateCcw aria-hidden="true" size={14} /> Confirm restore</button></div></section>;
}

function flattenTabs(workspace: PortableWorkspace): SnapshotTabEntry[] {
  return workspace.windows.flatMap((window, windowIndex) => window.tabs.map((tab) => {
    const group = window.groups.find((candidate) => candidate.tabLocalIds.includes(tab.localId));
    return { tab, location: { windowId: window.localId, windowIndex, groupId: group?.localId, groupTitle: group?.title, groupColor: group?.color, index: tab.index } };
  }));
}

function toSelectedSnapshot(item: OperationSnapshot): SelectedSnapshot {
  return { source: 'history', label: `${formatDate(item.operation.requestedAt)} · ${item.operation.operationType} · ${item.phase}`, snapshotId: item.snapshot.snapshotId, workspace: item.snapshot.workspace, operationId: item.operation.operationId, phase: item.phase };
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
