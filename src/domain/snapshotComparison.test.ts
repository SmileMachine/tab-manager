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
    expect(result.diffs[0].details).toEqual(expect.arrayContaining(['Title changed.', 'Pinned state changed.']));
  });

  it('matches duplicate URLs as separate occurrences', () => {
    const result = comparePortableWorkspaces(
      workspace([
        tab('snapshot-1', 'https://duplicate.test', 'First', 0),
        tab('snapshot-2', 'https://duplicate.test', 'Second', 1)
      ]),
      workspace([
        tab('current-1', 'https://duplicate.test', 'Second', 0),
        tab('current-2', 'https://duplicate.test', 'First', 1)
      ])
    );

    expect(result.summary.unchanged).toBe(2);
    expect(result.summary.changed).toBe(0);
    expect(result.summary['snapshot-only']).toBe(0);
    expect(result.summary['current-only']).toBe(0);
    expect(result.diffs.every((diff) => diff.duplicateGroupSize === 2)).toBe(true);
  });

  it('reports only the unmatched occurrences when duplicate counts differ', () => {
    const result = comparePortableWorkspaces(
      workspace([
        tab('snapshot-1', 'https://duplicate.test', 'First', 0),
        tab('snapshot-2', 'https://duplicate.test', 'Second', 1)
      ]),
      workspace([tab('current-1', 'https://duplicate.test', 'First', 0)])
    );

    expect(result.summary.unchanged).toBe(1);
    expect(result.summary['snapshot-only']).toBe(1);
    expect(result.summary['current-only']).toBe(0);
  });

  it('falls back to title matching when the URL changed', () => {
    const result = comparePortableWorkspaces(
      workspace([tab('snapshot-1', 'https://old.test', 'Same title', 0)]),
      workspace([tab('current-1', 'https://new.test', 'Same title', 0)])
    );

    expect(result.summary.changed).toBe(1);
    expect(result.diffs[0]).toMatchObject({ kind: 'changed', matchBy: 'title' });
    expect(result.diffs[0].details).toContain('URL changed.');
  });

  it('does not count position changes by default but can enable them', () => {
    const snapshot = workspace([tab('snapshot-1', 'https://example.com', 'Same', 0)]);
    const current = workspace([tab('current-1', 'https://example.com', 'Same', 2)]);

    expect(comparePortableWorkspaces(snapshot, current).summary.unchanged).toBe(1);
    expect(comparePortableWorkspaces(snapshot, current, { changedFields: ['position'] }).summary.changed).toBe(1);
  });

  it('reports unchanged tabs', () => {
    const result = comparePortableWorkspaces(
      workspace([tab('snapshot-1', 'https://example.com', 'Same', 0)]),
      workspace([tab('current-1', 'https://example.com', 'Same', 0)])
    );

    expect(result.summary.unchanged).toBe(1);
  });
});
