import { describe, expect, it } from 'vitest';

import type { PortableWorkspace } from '../codex/protocol';
import { comparePortableWorkspaces } from './snapshotComparison';

const workspace = (tabs: PortableWorkspace['windows'][number]['tabs']): PortableWorkspace => ({
  schemaVersion: 1,
  exportedAt: '2026-09-02T00:00:00.000Z',
  windows: [{
    localId: 'window-0',
    type: 'normal',
    tabs,
    groups: []
  }]
});

const tab = (localId: string, url: string, title: string, index: number, pinned = false) => ({
  localId, url, title, index, pinned, active: index === 0
});

describe('comparePortableWorkspaces', () => {
  it('matches by URL before title and reports metadata changes', () => {
    const result = comparePortableWorkspaces(
      workspace([tab('snapshot-1', 'https://example.com', 'Old', 0)]),
      workspace([tab('current-1', 'https://example.com', 'New', 2, true)])
    );

    expect(result.summary.changed).toBe(1);
    expect(result.diffs[0]).toMatchObject({ kind: 'changed', matchBy: 'url' });
    expect(result.diffs[0].details).toEqual(expect.arrayContaining(['Title changed.', 'Pinned state changed.', 'Order changed from 0 to 2.']));
  });

  it('reports unmatched and ambiguous tabs', () => {
    const result = comparePortableWorkspaces(
      workspace([tab('snapshot-1', '', 'Repeated', 0), tab('snapshot-2', 'https://missing.test', 'Missing', 1)]),
      workspace([tab('current-1', 'https://one.test', 'Repeated', 0), tab('current-2', 'https://two.test', 'Repeated', 1), tab('current-3', 'https://extra.test', 'Extra', 2)])
    );

    expect(result.summary.ambiguous).toBe(1);
    expect(result.summary['snapshot-only']).toBe(1);
    expect(result.summary['current-only']).toBe(3);
  });

  it('reports unchanged tabs', () => {
    const result = comparePortableWorkspaces(
      workspace([tab('snapshot-1', 'https://example.com', 'Same', 0)]),
      workspace([tab('current-1', 'https://example.com', 'Same', 0)])
    );

    expect(result.summary.unchanged).toBe(1);
  });
});
