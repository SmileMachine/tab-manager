import { describe, expect, it } from 'vitest';
import { buildAgentContextMetadata, sanitizeUrl } from './metadata';
import type { BrowserSnapshotView } from '../domain/types';

const view: BrowserSnapshotView = {
  windows: [{
    id: 1, focused: true, type: 'normal',
    items: [
      { kind: 'tab', tab: { id: 1, windowId: 1, index: 0, groupId: -1, title: 'A', url: 'https://user:pass@example.test/path?secret=1#fragment', pinned: false, active: true, audible: false } },
      { kind: 'tab', tab: { id: 2, windowId: 1, index: 1, groupId: -1, title: 'B', url: 'chrome://settings', pinned: false, active: false, audible: false, isInternalPage: true } }
    ], groupSpans: []
  }]
};

describe('Agent context metadata', () => {
  it('sanitizes URLs and excludes internal pages by default', () => {
    expect(sanitizeUrl('https://user:pass@example.test/path?secret=1#fragment')).toBe('https://example.test/path');
    expect(buildAgentContextMetadata(view).tabIds).toEqual([1]);
  });

  it('requires a non-empty eligible context', () => {
    const emptyView: BrowserSnapshotView = { windows: [{ ...view.windows[0], items: [] }] };
    expect(() => buildAgentContextMetadata(emptyView)).toThrow('no eligible tabs');
  });
});
