import { describe, expect, it } from 'vitest';
import { AGENT_MAX_TOOL_TABS, buildAgentContextMetadata, compactAgentToolTabs, sanitizeUrl } from './metadata';
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


  it('keeps large browser contexts available and appends a compact summary', () => {
    const manyTabs = Array.from({ length: 201 }, (_, index) => ({
      kind: 'tab' as const,
      tab: { id: index + 1, windowId: 1, index, groupId: -1, title: `Tab ${index + 1}`, pinned: false, active: index === 0, audible: false }
    }));
    const largeView: BrowserSnapshotView = { windows: [{ ...view.windows[0], items: manyTabs }] };
    const context = buildAgentContextMetadata(largeView);
    expect(context.tabIds).toHaveLength(201);
    expect(context.summary).toContain('Eligible tabs: 201');
    expect(context.summary).toContain('normal windows: 1');
    expect(context.summary).toContain('Groups (0)');
    expect(compactAgentToolTabs(context.tabs)).toHaveLength(AGENT_MAX_TOOL_TABS);
    expect(compactAgentToolTabs(context.tabs)[0]).toMatchObject({ tabId: 1, title: 'Tab 1' });
  });

  it('requires a non-empty eligible context', () => {
    const emptyView: BrowserSnapshotView = { windows: [{ ...view.windows[0], items: [] }] };
    expect(() => buildAgentContextMetadata(emptyView)).toThrow('no eligible tabs');
  });
});
