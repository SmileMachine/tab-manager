import { act, type ReactNode } from 'react';
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

    const checkbox = container?.querySelector<HTMLInputElement>('.workspace-canvas .tab-row input');
    expect(checkbox).toBeTruthy();
    act(() => checkbox?.click());
    const openButton = findButton('Open selected');
    expect(openButton.disabled).toBe(false);
    await act(async () => { openButton.click(); await Promise.resolve(); });

    expect(actions.openSnapshotTabs).toHaveBeenCalledWith(expect.anything(), ['tab-0-0']);
  });

  it('opens the named snapshot context menu and supports rename and delete', async () => {
    const actions = fakeActions();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(actions);
    await flush();

    const named = container?.querySelector<HTMLButtonElement>('.snapshot-list-item');
    expect(named).toBeTruthy();
    act(() => named?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 32 })));
    expect(container?.textContent).toContain('Named snapshot');
    expect(container?.textContent).toContain('Rename');
    expect(container?.textContent).toContain('Delete');

    await act(async () => { findButton('Rename').click(); await Promise.resolve(); });
    expect(container?.querySelector<HTMLInputElement>('input[aria-label="Named snapshot name"]')).toBeTruthy();
    await act(async () => { container?.querySelector<HTMLButtonElement>('button[aria-label="Save snapshot name"]')?.click(); await Promise.resolve(); });
    expect(actions.renameNamedSnapshot).toHaveBeenCalledWith('checkpoint-1', 'Morning workspace');

    act(() => named?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 32 })));
    await act(async () => { findButton('Delete').click(); await Promise.resolve(); });
    expect(actions.deleteNamedSnapshot).toHaveBeenCalledWith('checkpoint-1');
    confirm.mockRestore();
  });

  it('uses Current as a peer workspace and supports a collapsible sidebar', async () => {
    const actions = fakeActions();
    render(actions, <div data-testid="current-content">Current browser workspace</div>, '3 windows · 991 tabs · 21 groups', <section className="workspace-content-toolbar"><div className="toolbar">Current filters</div></section>);
    await flush();

    expect(container?.querySelector('.workspace-shell')).toBeTruthy();
    expect(container?.querySelector('[data-testid="current-content"]')).toBeTruthy();
    expect(container?.textContent).toContain('Save current snapshot');
    expect(container?.querySelector('.workspace-toolbar-meta')?.textContent).toBe('3 windows · 991 tabs · 21 groups');
    expect(container?.querySelector('.workspace-current-item .workspace-nav-item-meta')).toBeNull();
    expect(container?.querySelector('.workspace-main > .workspace-content-toolbar > .toolbar')).toBeTruthy();
    expect(container?.querySelector('.workspace-toolbar-title > .workspace-toolbar-name')).toBeTruthy();

    await act(async () => { findButton('Morning workspace').click(); await Promise.resolve(); });
    expect(container?.querySelector('[data-testid="current-content"]')).toBeNull();
    expect(container?.querySelector('.workspace-main > .workspace-content-toolbar > .toolbar')).toBeTruthy();
    expect(container?.querySelector('.workspace-main-content > .snapshot-selection-bar')).toBeNull();
    expect(container?.querySelector('.workspace-main-content > .workspace-canvas')).toBeTruthy();

    const snapshotTabCheckbox = container?.querySelector<HTMLInputElement>('.workspace-canvas .tab-row input');
    expect(snapshotTabCheckbox).toBeTruthy();
    act(() => snapshotTabCheckbox?.click());
    expect(container?.querySelector('.workspace-toolbar-title .selection-chip')?.textContent).toContain('1 selected');
    act(() => container?.querySelector<HTMLButtonElement>('.workspace-toolbar-title .selection-chip button')?.click());
    expect(container?.querySelector('.workspace-toolbar-title .selection-chip')).toBeNull();
    expect(container?.querySelector('.workspace-toolbar-title > .workspace-toolbar-name')).toBeTruthy();
    expect(container?.querySelector('.workspace-main-content > .snapshot-detail')).toBeNull();

    const collapse = container?.querySelector<HTMLButtonElement>('[aria-label="Collapse workspace sidebar"]');
    expect(collapse).toBeTruthy();
    act(() => collapse?.click());
    expect(container?.querySelector('.workspace-shell')?.classList.contains('is-sidebar-collapsed')).toBe(true);

    await act(async () => { findButton('Current').click(); await Promise.resolve(); });
    expect(container?.querySelector('[data-testid="current-content"]')).toBeTruthy();
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
    expect(container?.textContent).toContain('Snapshot vs current');
    expect(container?.textContent).toContain('Show unchanged');
    expect(container?.textContent).not.toContain('ambiguous');
    const showUnchanged = [...(container?.querySelectorAll('label') ?? [])].find((label) => label.textContent?.trim() === 'Show unchanged')?.querySelector('input');
    expect(showUnchanged?.checked).toBe(false);
    const positionLabel = [...(container?.querySelectorAll('label') ?? [])].find((label) => label.textContent?.trim() === 'Position');
    const positionCheckbox = positionLabel?.querySelector('input');
    expect(positionCheckbox).toBeTruthy();
    expect(positionCheckbox?.checked).toBe(false);
    const titleLabel = [...(container?.querySelectorAll('label') ?? [])].find((label) => label.textContent?.trim() === 'Title');
    expect(titleLabel?.querySelector('input')?.checked).toBe(true);
  });
});

function render(actions: SnapshotActions, currentContent?: ReactNode, currentSummary?: string, currentContentToolbar?: ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<SnapshotWorkspace actions={actions} onClose={vi.fn()} onBrowserRefresh={vi.fn()} currentContent={currentContent} currentContentToolbar={currentContentToolbar} currentSummary={currentSummary} />));
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
    renameNamedSnapshot: vi.fn().mockImplementation(async (checkpointId: string, name: string) => ({
      checkpoint: { checkpointId, name, createdAt: '2026-09-02T00:00:00.000Z', snapshotId: 'snapshot-1', revision: 'revision-1' },
      snapshot: { snapshotId: 'snapshot-1', revision: 'revision-1', capturedAt: '2026-09-02T00:00:00.000Z', workspace }
    })),
    deleteNamedSnapshot: vi.fn().mockResolvedValue(undefined),
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
