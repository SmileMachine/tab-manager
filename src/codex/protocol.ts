import type {
  BrowserSnapshot,
  BrowserTabGroupColor,
  NativeGroupId,
  NativeTabId,
  NativeWindowId
} from '../domain/types';

export const CODEX_PROTOCOL_VERSION = '1.0';
export const BROWSER_SNAPSHOT_SCHEMA_VERSION = 1;
export const WORKSPACE_SCHEMA_VERSION = 1;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SnapshotFieldSet = 'minimal' | 'grouping' | 'full';
export type OperationReturnState = 'none' | 'affected' | 'grouping' | 'full';

export interface SnapshotDiagnostic {
  code: string;
  message: string;
  entity?: 'window' | 'tab' | 'group' | 'content';
  entityId?: number;
}

export interface BrowserSnapshotEnvelope {
  schemaVersion: typeof BROWSER_SNAPSHOT_SCHEMA_VERSION;
  capturedAt: string;
  revision: string;
  fieldSet: SnapshotFieldSet;
  snapshot: BrowserSnapshot;
  diagnostics: SnapshotDiagnostic[];
}

export interface PortableWorkspace {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  exportedAt: string;
  windows: PortableWindowWithGroups[];
  activeWindowLocalId?: string;
}

export interface PortableWindow {
  localId: string;
  type: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
  incognito?: boolean;
  state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'locked' | 'locked-fullscreen';
  tabs: PortableTab[];
}

export interface PortableWindowWithGroups extends PortableWindow {
  groups: PortableGroup[];
}

export interface PortableTab {
  localId: string;
  index: number;
  title?: string;
  url?: string;
  pendingUrl?: string;
  pinned: boolean;
  active: boolean;
  groupLocalId?: string;
  openerLocalId?: string;
}

export interface PortableGroup {
  localId: string;
  title?: string;
  color: BrowserTabGroupColor;
  collapsed: boolean;
  tabLocalIds: string[];
}

export type CodexToolName =
  | 'tab_group.get_capabilities'
  | 'tab_group.get_snapshot'
  | 'tab_group.list_windows'
  | 'tab_group.list_tabs'
  | 'tab_group.list_groups'
  | 'tab_group.get_tabs'
  | 'tab_group.get_groups'
  | 'tab_group.get_window'
  | 'tab_group.export_workspace'
  | 'tab_group.get_events'
  | 'tab_group.prune_history'
  | 'tab_group.inspect_tabs'
  | 'tab_group.inspect_tab'
  | 'tab_group.read_tab_content'
  | 'tab_group.activate_tab'
  | 'tab_group.create_tabs'
  | 'tab_group.update_tab'
  | 'tab_group.move_tabs'
  | 'tab_group.reorder_tabs'
  | 'tab_group.close_tabs'
  | 'tab_group.discard_tabs'
  | 'tab_group.ungroup_tabs'
  | 'tab_group.create_group'
  | 'tab_group.update_group'
  | 'tab_group.move_tabs_to_group'
  | 'tab_group.move_group'
  | 'tab_group.ungroup_group'
  | 'tab_group.preview_operations'
  | 'tab_group.apply_operations'
  | 'tab_group.preview_import'
  | 'tab_group.import_workspace'
  | 'tab_group.list_operation_history'
  | 'tab_group.get_operation'
  | 'tab_group.create_checkpoint'
  | 'tab_group.list_checkpoints'
  | 'tab_group.preview_rollback'
  | 'tab_group.rollback_operation';

export interface CodexRpcRequest<TParams = JsonValue> {
  protocolVersion: typeof CODEX_PROTOCOL_VERSION;
  requestId: string;
  method: CodexToolName;
  params?: TParams;
}

export interface CodexRpcSuccess<TValue = JsonValue> {
  protocolVersion: typeof CODEX_PROTOCOL_VERSION;
  requestId: string;
  result: TValue;
}

export interface CodexRpcError {
  protocolVersion: typeof CODEX_PROTOCOL_VERSION;
  requestId: string;
  error: CodexRpcErrorObject;
}

export interface CodexRpcErrorObject {
  code:
    | 'invalid-request'
    | 'unsupported-version'
    | 'unknown-method'
    | 'invalid-params'
    | 'permission-required'
    | 'unsupported-page'
    | 'stale-state'
    | 'stale-preview'
    | 'not-found'
    | 'confirmation-required'
    | 'operation-failed'
    | 'partial-failure'
    | 'transport-unavailable';
  message: string;
  details?: JsonValue;
}

export type CodexRpcResponse<TValue = JsonValue> = CodexRpcSuccess<TValue> | CodexRpcError;

export interface TabQuery {
  windowId?: NativeWindowId;
  windowIds?: NativeWindowId[];
  groupId?: NativeGroupId;
  groupIds?: NativeGroupId[];
  text?: string;
  textAny?: string[];
  hostname?: string;
  hostnameAny?: string[];
  urlPrefixAny?: string[];
  pinned?: boolean;
  active?: boolean;
  discarded?: boolean;
  includeNeighbors?: number;
  includeSegments?: boolean;
  fieldSet?: SnapshotFieldSet;
}

export interface TabReference {
  tabId: NativeTabId;
}

export interface GroupReference {
  groupId: NativeGroupId;
}

export type OperationSource = 'manager' | 'codex' | 'import' | 'rollback';
export type OperationStatus = 'pending' | 'succeeded' | 'partially-failed' | 'failed' | 'rolled-back';

export interface OperationRecord {
  operationId: string;
  source: OperationSource;
  operationType: string;
  requestedAt: string;
  completedAt?: string;
  status: OperationStatus;
  beforeSnapshotId: string;
  afterSnapshotId?: string;
  expectedRevision?: string;
  actualRevision?: string;
  requestSummary?: JsonValue;
  warnings: string[];
  errors: string[];
  revertsOperationId?: string;
  idempotencyKey?: string;
  result?: JsonValue;
}

export interface SnapshotReference {
  snapshotId: string;
  revision: string;
  capturedAt: string;
}

export interface RollbackChange {
  kind: 'create-tab' | 'move-tab' | 'update-tab' | 'create-group' | 'update-group' | 'move-tab-to-group' | 'ungroup-tab' | 'close-tab' | 'activate-tab';
  targetLocalId?: string;
  nativeId?: number;
  message: string;
  reversible: boolean;
}

export interface RollbackPreview {
  targetSnapshotId: string;
  currentRevision: string;
  targetRevision: string;
  targetWindowCount: number;
  targetTabCount: number;
  targetGroupCount: number;
  changes: RollbackChange[];
  warnings: string[];
  requiresConfirmation: boolean;
}

export interface RollbackResult {
  operationId: string;
  restoredSnapshotId: string;
  revision: string;
  warnings: string[];
  changes: RollbackChange[];
}

export type WorkspaceImportMode = 'append' | 'replace';

export interface WorkspaceImportItem {
  kind: 'window' | 'tab' | 'group';
  localId: string;
  status: 'create' | 'reuse' | 'skip' | 'close';
  message: string;
}

export interface WorkspaceImportPreview {
  mode: WorkspaceImportMode;
  valid: boolean;
  requiresConfirmation: boolean;
  items: WorkspaceImportItem[];
  warnings: string[];
  errors: string[];
}

export interface WorkspaceImportResult {
  operationId: string;
  mode: WorkspaceImportMode;
  windowIdMap: Record<string, number>;
  tabIdMap: Record<string, number>;
  groupIdMap: Record<string, number>;
  skipped: WorkspaceImportItem[];
  warnings: string[];
  snapshot: BrowserSnapshotEnvelope;
}

export type ContentReadMode = 'outline' | 'excerpt' | 'focused' | 'structured';
export type ContentBudgetName = 'compact' | 'focused' | 'expanded';

export interface ContentReadOptions {
  mode?: ContentReadMode;
  budget?: ContentBudgetName;
  maxChars?: number;
  maxSnippets?: number;
  focusTerms?: string[];
}

export interface ContentReadResult {
  tabId: NativeTabId;
  capturedAt: string;
  contentTrust: 'untrusted-page-data';
  title?: string;
  canonicalUrl?: string;
  language?: string;
  description?: string;
  headings: Array<{ level: number; text: string }>;
  pageKind: 'article' | 'document' | 'search' | 'application' | 'unknown';
  excerpt?: string;
  snippets?: string[];
  returnedChars: number;
  estimatedTokens: number;
  textLength: number;
  contentHash: string;
  truncated: boolean;
}

export type ContentInspectionOutcome =
  | { status: 'ok'; content: ContentReadResult }
  | {
      status: 'permission-required' | 'unsupported-page' | 'tab-unavailable' | 'injection-failed';
      tabId: NativeTabId;
      message: string;
      origin?: string;
    };

export function isCodexRpcRequest(value: unknown): value is CodexRpcRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const request = value as Partial<CodexRpcRequest>;
  return (
    request.protocolVersion === CODEX_PROTOCOL_VERSION &&
    typeof request.requestId === 'string' &&
    request.requestId.length > 0 &&
    typeof request.method === 'string' &&
    request.method.startsWith('tab_group.')
  );
}

export function createRpcError(requestId: string, error: CodexRpcErrorObject): CodexRpcError {
  return {
    protocolVersion: CODEX_PROTOCOL_VERSION,
    requestId,
    error
  };
}
