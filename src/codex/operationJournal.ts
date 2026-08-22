import type { BrowserSnapshot } from '../domain/types';
import type {
  OperationRecord,
  OperationSource,
  OperationStatus,
  PortableWorkspace,
  JsonValue,
  SnapshotReference
} from './protocol';
import { createSnapshotEnvelope, toPortableWorkspace } from './snapshot';

const OPERATION_JOURNAL_DATABASE = 'tab-group-codex';
const OPERATION_JOURNAL_VERSION = 1;
const SNAPSHOTS_STORE = 'snapshots';
const OPERATIONS_STORE = 'operations';
const CHECKPOINTS_STORE = 'checkpoints';

export interface WorkspaceSnapshotRecord extends SnapshotReference {
  workspace: PortableWorkspace;
}

export interface CheckpointRecord {
  checkpointId: string;
  name: string;
  createdAt: string;
  snapshotId: string;
  revision: string;
}

export interface HistoryRetentionOptions {
  maxOperations?: number;
  maxCheckpoints?: number;
  maxSnapshots?: number;
}

export interface HistoryPruneResult {
  deletedOperations: number;
  deletedCheckpoints: number;
  deletedSnapshots: number;
  retainedOperations: number;
  retainedCheckpoints: number;
  retainedSnapshots: number;
}

export interface OperationJournalStore {
  getCheckpoint(checkpointId: string): Promise<CheckpointRecord | undefined>;
  getOperation(operationId: string): Promise<OperationRecord | undefined>;
  getOperationByIdempotencyKey(idempotencyKey: string): Promise<OperationRecord | undefined>;
  getSnapshot(snapshotId: string): Promise<WorkspaceSnapshotRecord | undefined>;
  listCheckpoints(): Promise<CheckpointRecord[]>;
  listOperations(): Promise<OperationRecord[]>;
  listSnapshots(): Promise<WorkspaceSnapshotRecord[]>;
  deleteCheckpoint(checkpointId: string): Promise<void>;
  deleteOperation(operationId: string): Promise<void>;
  deleteSnapshot(snapshotId: string): Promise<void>;
  putCheckpoint(checkpoint: CheckpointRecord): Promise<void>;
  putOperation(operation: OperationRecord): Promise<void>;
  putSnapshot(snapshot: WorkspaceSnapshotRecord): Promise<void>;
}

export interface BeginOperationOptions {
  source: OperationSource;
  operationType: string;
  beforeSnapshot: BrowserSnapshot;
  expectedRevision?: string;
  requestSummary?: OperationRecord['requestSummary'];
  idempotencyKey?: string;
}

export interface CompleteOperationOptions {
  afterSnapshot: BrowserSnapshot;
  status?: Extract<OperationStatus, 'succeeded' | 'partially-failed' | 'failed' | 'rolled-back'>;
  warnings?: string[];
  errors?: string[];
  revertsOperationId?: string;
  result?: JsonValue;
}

export class OperationJournal {
  constructor(
    private readonly store: OperationJournalStore,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID()
  ) {}

  async begin(options: BeginOperationOptions): Promise<OperationRecord> {
    const before = await this.saveBrowserSnapshot(options.beforeSnapshot);
    const operation: OperationRecord = {
      operationId: this.createId(),
      source: options.source,
      operationType: options.operationType,
      requestedAt: this.now().toISOString(),
      status: 'pending',
      beforeSnapshotId: before.snapshotId,
      expectedRevision: options.expectedRevision,
      requestSummary: options.requestSummary,
      idempotencyKey: options.idempotencyKey,
      warnings: [],
      errors: []
    };

    await this.store.putOperation(operation);
    return operation;
  }

  async complete(operation: OperationRecord, options: CompleteOperationOptions): Promise<OperationRecord> {
    const after = await this.saveBrowserSnapshot(options.afterSnapshot);
    const completed: OperationRecord = {
      ...operation,
      completedAt: this.now().toISOString(),
      status: options.status ?? 'succeeded',
      afterSnapshotId: after.snapshotId,
      actualRevision: after.revision,
      warnings: [...options.warnings ?? []],
      errors: [...options.errors ?? []],
      revertsOperationId: options.revertsOperationId,
      result: options.result
    };

    await this.store.putOperation(completed);
    return completed;
  }

  async createCheckpoint(name: string, snapshot: BrowserSnapshot): Promise<CheckpointRecord> {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Checkpoint name cannot be empty.');
    }

    const saved = await this.saveBrowserSnapshot(snapshot);
    const checkpoint: CheckpointRecord = {
      checkpointId: this.createId(),
      name: normalizedName,
      createdAt: this.now().toISOString(),
      snapshotId: saved.snapshotId,
      revision: saved.revision
    };

    await this.store.putCheckpoint(checkpoint);
    return checkpoint;
  }

  getCheckpoint(checkpointId: string) {
    return this.store.getCheckpoint(checkpointId);
  }

  getOperation(operationId: string) {
    return this.store.getOperation(operationId);
  }

  getOperationByIdempotencyKey(idempotencyKey: string) {
    return this.store.getOperationByIdempotencyKey(idempotencyKey);
  }

  getSnapshot(snapshotId: string) {
    return this.store.getSnapshot(snapshotId);
  }

  listCheckpoints() {
    return this.store.listCheckpoints();
  }

  listOperations() {
    return this.store.listOperations();
  }

  async pruneHistory(options: HistoryRetentionOptions = {}): Promise<HistoryPruneResult> {
    const operations = await this.store.listOperations();
    const checkpoints = await this.store.listCheckpoints();
    const snapshots = await this.store.listSnapshots();
    const keptOperations = limitRecords(operations, options.maxOperations);
    const keptCheckpoints = limitRecords(checkpoints, options.maxCheckpoints);
    const referenced = new Set<string>();
    keptOperations.forEach((operation) => {
      referenced.add(operation.beforeSnapshotId);
      if (operation.afterSnapshotId) referenced.add(operation.afterSnapshotId);
    });
    keptCheckpoints.forEach((checkpoint) => referenced.add(checkpoint.snapshotId));

    for (const operation of operations.slice(keptOperations.length)) await this.store.deleteOperation(operation.operationId);
    for (const checkpoint of checkpoints.slice(keptCheckpoints.length)) await this.store.deleteCheckpoint(checkpoint.checkpointId);

    const unreferenced = snapshots
      .filter((snapshot) => !referenced.has(snapshot.snapshotId))
      .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
    const maxSnapshots = options.maxSnapshots ?? 0;
    const deleteCount = Math.max(0, snapshots.length - maxSnapshots);
    for (const snapshot of unreferenced.slice(0, deleteCount)) await this.store.deleteSnapshot(snapshot.snapshotId);

    return {
      deletedOperations: operations.length - keptOperations.length,
      deletedCheckpoints: checkpoints.length - keptCheckpoints.length,
      deletedSnapshots: Math.min(deleteCount, unreferenced.length),
      retainedOperations: keptOperations.length,
      retainedCheckpoints: keptCheckpoints.length,
      retainedSnapshots: snapshots.length - Math.min(deleteCount, unreferenced.length)
    };
  }

  private async saveBrowserSnapshot(snapshot: BrowserSnapshot): Promise<WorkspaceSnapshotRecord> {
    const envelope = createSnapshotEnvelope(snapshot, { fieldSet: 'full' });
    const workspace = toPortableWorkspace(snapshot, envelope.capturedAt);
    const record: WorkspaceSnapshotRecord = {
      snapshotId: createWorkspaceSnapshotId(workspace),
      revision: envelope.revision,
      capturedAt: envelope.capturedAt,
      workspace
    };
    const existing = await this.store.getSnapshot(record.snapshotId);

    if (!existing) {
      await this.store.putSnapshot(record);
    }

    return existing ?? record;
  }
}

export class InMemoryOperationJournalStore implements OperationJournalStore {
  private readonly checkpoints = new Map<string, CheckpointRecord>();
  private readonly operations = new Map<string, OperationRecord>();
  private readonly snapshots = new Map<string, WorkspaceSnapshotRecord>();

  async getCheckpoint(checkpointId: string) {
    return clone(this.checkpoints.get(checkpointId));
  }

  async getOperation(operationId: string) {
    return clone(this.operations.get(operationId));
  }

  async getOperationByIdempotencyKey(idempotencyKey: string) {
    return [...this.operations.values()].find((operation) => operation.idempotencyKey === idempotencyKey);
  }

  async getSnapshot(snapshotId: string) {
    return clone(this.snapshots.get(snapshotId));
  }

  async listCheckpoints() {
    return [...this.checkpoints.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((checkpoint) => clone(checkpoint)!);
  }

  async listOperations() {
    return [...this.operations.values()]
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .map((operation) => clone(operation)!);
  }

  async listSnapshots() {
    return [...this.snapshots.values()].map((snapshot) => clone(snapshot)!);
  }

  async deleteCheckpoint(checkpointId: string) { this.checkpoints.delete(checkpointId); }
  async deleteOperation(operationId: string) { this.operations.delete(operationId); }
  async deleteSnapshot(snapshotId: string) { this.snapshots.delete(snapshotId); }

  async putCheckpoint(checkpoint: CheckpointRecord) {
    this.checkpoints.set(checkpoint.checkpointId, clone(checkpoint)!);
  }

  async putOperation(operation: OperationRecord) {
    this.operations.set(operation.operationId, clone(operation)!);
  }

  async putSnapshot(snapshot: WorkspaceSnapshotRecord) {
    this.snapshots.set(snapshot.snapshotId, clone(snapshot)!);
  }
}

export class IndexedDbOperationJournalStore implements OperationJournalStore {
  private databasePromise: Promise<IDBDatabase> | undefined;

  async getCheckpoint(checkpointId: string) {
    return this.get<CheckpointRecord>(CHECKPOINTS_STORE, checkpointId);
  }

  async getOperation(operationId: string) {
    return this.get<OperationRecord>(OPERATIONS_STORE, operationId);
  }

  async getOperationByIdempotencyKey(idempotencyKey: string) {
    const operations = await this.getAll<OperationRecord>(OPERATIONS_STORE);
    return operations.find((operation) => operation.idempotencyKey === idempotencyKey);
  }

  async getSnapshot(snapshotId: string) {
    return this.get<WorkspaceSnapshotRecord>(SNAPSHOTS_STORE, snapshotId);
  }

  async listCheckpoints() {
    const checkpoints = await this.getAll<CheckpointRecord>(CHECKPOINTS_STORE);
    return checkpoints.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listOperations() {
    const operations = await this.getAll<OperationRecord>(OPERATIONS_STORE);
    return operations.sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }

  async listSnapshots() {
    return this.getAll<WorkspaceSnapshotRecord>(SNAPSHOTS_STORE);
  }

  deleteCheckpoint(checkpointId: string) { return this.delete(CHECKPOINTS_STORE, checkpointId); }
  deleteOperation(operationId: string) { return this.delete(OPERATIONS_STORE, operationId); }
  deleteSnapshot(snapshotId: string) { return this.delete(SNAPSHOTS_STORE, snapshotId); }

  putCheckpoint(checkpoint: CheckpointRecord) {
    return this.put(CHECKPOINTS_STORE, checkpoint);
  }

  putOperation(operation: OperationRecord) {
    return this.put(OPERATIONS_STORE, operation);
  }

  putSnapshot(snapshot: WorkspaceSnapshotRecord) {
    return this.put(SNAPSHOTS_STORE, snapshot);
  }

  private async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const database = await this.getDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    const completed = transactionResult(transaction);
    const result = await requestResult<T | undefined>(transaction.objectStore(storeName).get(key));
    await completed;
    return result;
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    const database = await this.getDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    const completed = transactionResult(transaction);
    const result = await requestResult<T[]>(transaction.objectStore(storeName).getAll());
    await completed;
    return result;
  }

  private async put(storeName: string, value: unknown): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const completed = transactionResult(transaction);
    await requestResult(transaction.objectStore(storeName).put(value));
    await completed;
  }

  private async delete(storeName: string, key: string): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const completed = transactionResult(transaction);
    await requestResult(transaction.objectStore(storeName).delete(key));
    await completed;
  }

  private getDatabase(): Promise<IDBDatabase> {
    this.databasePromise ??= openOperationJournalDatabase();
    return this.databasePromise;
  }
}

export function createWorkspaceSnapshotId(workspace: PortableWorkspace): string {
  const { exportedAt: _exportedAt, ...rest } = workspace;
  return `workspace:${fnv1a(stableStringify(rest))}`;
}

function openOperationJournalDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OPERATION_JOURNAL_DATABASE, OPERATION_JOURNAL_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOTS_STORE)) database.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'snapshotId' });
      if (!database.objectStoreNames.contains(OPERATIONS_STORE)) database.createObjectStore(OPERATIONS_STORE, { keyPath: 'operationId' });
      if (!database.objectStoreNames.contains(CHECKPOINTS_STORE)) database.createObjectStore(CHECKPOINTS_STORE, { keyPath: 'checkpointId' });
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to open operation journal database.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T = undefined>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.oncomplete = () => resolve();
  });
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function limitRecords<T>(records: T[], limit: number | undefined): T[] {
  if (limit === undefined) return records;
  if (!Number.isInteger(limit) || limit < 0) throw new Error('History retention limits must be non-negative integers.');
  return records.slice(0, limit);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

function fnv1a(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
