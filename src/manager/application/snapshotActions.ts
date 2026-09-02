import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';
import { handleCodexImportRequest } from '../../codex/importService';
import { OperationJournal, type WorkspaceSnapshotRecord } from '../../codex/operationJournal';
import { handleCodexRollbackRequest } from '../../codex/rollbackService';
import {
  CODEX_PROTOCOL_VERSION,
  type CheckpointRecord,
  type CodexRpcResponse,
  type OperationRecord,
  type PortableWorkspace,
  type RollbackPreview,
  type RollbackResult,
  type WorkspaceImportMode,
  type WorkspaceImportPreview,
  type WorkspaceImportResult
} from '../../codex/protocol';
import { toPortableWorkspace } from '../../codex/snapshot';
import { defaultSnapshotName, uniqueSnapshotName } from '../view/snapshotTime';

export interface NamedSnapshot {
  checkpoint: CheckpointRecord;
  snapshot: WorkspaceSnapshotRecord;
}

export interface OperationSnapshot {
  operation: OperationRecord;
  phase: 'before' | 'after';
  snapshot: WorkspaceSnapshotRecord;
}

export interface SnapshotActions {
  listNamedSnapshots(): Promise<NamedSnapshot[]>;
  listOperationHistory(): Promise<OperationRecord[]>;
  getOperationSnapshot(operationId: string, phase: 'before' | 'after'): Promise<OperationSnapshot | undefined>;
  createNamedSnapshot(name?: string): Promise<NamedSnapshot>;
  getCurrentWorkspace(): Promise<PortableWorkspace>;
  getSnapshot(snapshotId: string): Promise<WorkspaceSnapshotRecord | undefined>;
  openSnapshotTabs(workspace: PortableWorkspace, tabLocalIds: string[]): Promise<number[]>;
  exportWorkspace(workspace: PortableWorkspace): string;
  previewImport(workspace: PortableWorkspace, mode: WorkspaceImportMode): Promise<WorkspaceImportPreview>;
  importWorkspace(workspace: PortableWorkspace, mode: WorkspaceImportMode): Promise<WorkspaceImportResult>;
  previewRollback(target: { checkpointId?: string; snapshotId?: string; operationId?: string }, closeExtraTabs: boolean): Promise<RollbackPreview>;
  rollback(target: { checkpointId?: string; snapshotId?: string; operationId?: string }, closeExtraTabs: boolean): Promise<RollbackResult>;
}

export function createSnapshotActions(
  browserApi: BrowserTabsApi,
  journaledApi: BrowserTabsApi,
  journal: OperationJournal,
  now: () => Date = () => new Date()
): SnapshotActions {
  return {
    async listNamedSnapshots() {
      const checkpoints = await journal.listCheckpoints();
      const snapshots = await Promise.all(checkpoints.map(async (checkpoint) => {
        const snapshot = await journal.getSnapshot(checkpoint.snapshotId);
        return snapshot ? { checkpoint, snapshot } : undefined;
      }));
      return snapshots.filter((item): item is NamedSnapshot => item !== undefined);
    },
    listOperationHistory: () => journal.listOperations(),
    async getOperationSnapshot(operationId, phase) {
      const operation = await journal.getOperation(operationId);
      if (!operation) return undefined;
      const snapshotId = phase === 'before' ? operation.beforeSnapshotId : operation.afterSnapshotId;
      if (!snapshotId) return undefined;
      const snapshot = await journal.getSnapshot(snapshotId);
      return snapshot ? { operation, phase, snapshot } : undefined;
    },
    async createNamedSnapshot(name) {
      const checkpoints = await journal.listCheckpoints();
      const normalizedName = name?.trim();
      const baseName = normalizedName || defaultSnapshotName(now());
      const checkpointName = normalizedName ? baseName : uniqueSnapshotName(baseName, checkpoints.map((item) => item.name));
      const checkpoint = await journal.createCheckpoint(checkpointName, await browserApi.loadSnapshot());
      const snapshot = await journal.getSnapshot(checkpoint.snapshotId);
      if (!snapshot) throw new Error('The saved snapshot could not be loaded from the operation journal.');
      return { checkpoint, snapshot };
    },
    async getCurrentWorkspace() {
      return toPortableWorkspace(await browserApi.loadSnapshot());
    },
    getSnapshot: (snapshotId) => journal.getSnapshot(snapshotId),
    async openSnapshotTabs(workspace, tabLocalIds) {
      if (!browserApi.createTabs || !journaledApi.createTabs) throw new Error('The browser adapter cannot create tabs.');
      const current = await browserApi.loadSnapshot();
      const targetWindow = current.windows.find((window) => window.focused) ?? current.windows[0];
      if (!targetWindow) throw new Error('No browser window is available for opening snapshot tabs.');
      const requested = new Set(tabLocalIds);
      const tabs = workspace.windows.flatMap((window) => window.tabs)
        .filter((tab) => requested.has(tab.localId))
        .map((tab) => ({
          windowId: targetWindow.id,
          index: -1,
          url: tab.url ?? tab.pendingUrl,
          pinned: tab.pinned,
          active: false
        }));
      if (tabs.length === 0) return [];
      return journaledApi.createTabs(tabs);
    },
    exportWorkspace: (workspace) => `${JSON.stringify(workspace, null, 2)}\n`,
    async previewImport(workspace, mode) {
      return unwrap(await handleCodexImportRequest(request('tab_group.preview_import', { workspace, mode }), { api: browserApi, journal }));
    },
    async importWorkspace(workspace, mode) {
      return unwrap(await handleCodexImportRequest(request('tab_group.import_workspace', { workspace, mode, confirm: true }), { api: browserApi, journal }));
    },
    async previewRollback(target, closeExtraTabs) {
      return unwrap(await handleCodexRollbackRequest(request('tab_group.preview_rollback', { ...target, closeExtraTabs }), { api: browserApi, journal }));
    },
    async rollback(target, closeExtraTabs) {
      return unwrap(await handleCodexRollbackRequest(request('tab_group.rollback_operation', { ...target, closeExtraTabs, confirm: true }), { api: browserApi, journal }));
    }
  };
}

function request(method: 'tab_group.preview_import' | 'tab_group.import_workspace' | 'tab_group.preview_rollback' | 'tab_group.rollback_operation', params: Record<string, unknown>) {
  return {
    protocolVersion: CODEX_PROTOCOL_VERSION,
    requestId: `manager-${crypto.randomUUID()}`,
    method,
    params
  } as const;
}

function unwrap<T>(response: CodexRpcResponse<unknown>): T {
  if ('error' in response) throw new Error(response.error.message);
  return response.result as T;
}
