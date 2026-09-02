import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OperationRecord, PortableWorkspace } from '../../codex/protocol';
import type { SnapshotActions } from '../application/snapshotActions';
import { SnapshotWorkspace } from './SnapshotWorkspace';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('SnapshotWorkspace', () => {
  it('loads named snapshots, selects a tab, and opens it', async () => {
    const actions = fakeActions();
    render(actions);
    await flush();

    const named = container?.querySelector<HTMLButtonElement>('.snapshot-list-item');
    expect(named?.textContent).toContain('Morning workspace');
    await act(async () => { named?.click(); await Promise.resolve(); });

    const checkbox = container?.querySelector<HTMLInputElement>('.snapshot-tab-item input');
    expect(checkbox).toBeTruthy();
    act(() => checkbox?.click());
    const openButton = findButton('Open selected');
    expect(openButton.disabled).toBe(false);
    await act(async () => { openButton.click(); await Promise.resolve(); });

    expect(actions.openSnapshotTabs).toHaveBeenCalledWith(expect.anything(), ['tab-0-0']);
  });

  it('shows separate history source and supports comparison', async () => {
    const actions = fakeActions();
    render(actions);
    await flush();
    act(() => findButton('History').click());
    await act(async () => { findButton('Before').click(); await Promise.resolve(); });
    await flush();

    expect(container?.textContent).toContain('closeTabs');
    await act(async () => { findButton('Compare').click(); await Promise.resolve(); });
    await flush();
    expect(container?.textContent).toContain('Current vs snapshot');
  });
});

function render(actions: SnapshotActions) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<SnapshotWorkspace actions={actions} onClose={vi.fn()} onBrowserRefresh={vi.fn()} />));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButton(label: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  return button;
}

function fakeActions(): SnapshotActions {
  const workspace: PortableWorkspace = {
    schemaVersion: 1,
    exportedAt: '2026-09-02T00:00:00.000Z',
    windows: [{ localId: 'window-0', type: 'normal', tabs: [{ localId: 'tab-0-0', index: 0, title: 'Example', url: 'https://example.com', pinned: false, active: true }], groups: [] }]
  };
  const operation: OperationRecord = {
    operationId: 'operation-1', source: 'manager', operationType: 'closeTabs', requestedAt: '2026-09-02T00:00:00.000Z', status: 'succeeded', beforeSnapshotId: 'snapshot-before', afterSnapshotId: 'snapshot-after', warnings: [], errors: [], requestSummary: { tabIds: [1] }
  };
  return {
    listNamedSnapshots: vi.fn().mockResolvedValue([{ checkpoint: { checkpointId: 'checkpoint-1', name: 'Morning workspace', createdAt: '2026-09-02T00:00:00.000Z', snapshotId: 'snapshot-1', revision: 'revision-1' }, snapshot: { snapshotId: 'snapshot-1', revision: 'revision-1', capturedAt: '2026-09-02T00:00:00.000Z', workspace } }]),
    listOperationHistory: vi.fn().mockResolvedValue([operation]),
    getOperationSnapshot: vi.fn().mockResolvedValue({ operation, phase: 'before', snapshot: { snapshotId: 'snapshot-before', revision: 'revision-before', capturedAt: '2026-09-02T00:00:00.000Z', workspace } }),
    createNamedSnapshot: vi.fn(),
    getCurrentWorkspace: vi.fn().mockResolvedValue(workspace),
    getSnapshot: vi.fn(),
    openSnapshotTabs: vi.fn().mockResolvedValue([2]),
    exportWorkspace: vi.fn().mockReturnValue('{}'),
    previewImport: vi.fn(),
    importWorkspace: vi.fn(),
    previewRollback: vi.fn(),
    rollback: vi.fn()
  };
}
