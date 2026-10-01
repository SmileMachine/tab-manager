import { describe, expect, it } from 'vitest';
import { buildAgentScopeMetadata, sanitizeUrl } from './metadata';
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

describe('Agent scope metadata', () => {
  it('sanitizes URLs and excludes internal pages by default', () => {
    expect(sanitizeUrl('https://user:pass@example.test/path?secret=1#fragment')).toBe('https://example.test/path');
    expect(buildAgentScopeMetadata(view, { kind: 'selected', tabIds: [1, 2] }).tabIds).toEqual([1]);
  });

  it('requires a non-empty eligible scope', () => {
    expect(() => buildAgentScopeMetadata(view, { kind: 'selected', tabIds: [2] })).toThrow('no eligible tabs');
  });
});
