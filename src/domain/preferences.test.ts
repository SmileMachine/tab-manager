import { describe, expect, it } from 'vitest';

import { normalizePreferences } from './preferences';

describe('normalizePreferences', () => {
  it('keeps valid stable preferences', () => {
    expect(
      normalizePreferences({
        contentWidth: 'readable',
        density: 'compact',
        windowScope: { kind: 'all' },
        collapsedGroupIds: [1, 2],
        collapsedWindowIds: [10, 12],
        windowNames: { 10: 'Research', bad: '', 12: '  Work  ' }
      })
    ).toEqual({
      contentWidth: 'readable',
      density: 'compact',
      windowScope: { kind: 'all' },
      collapsedGroupIds: [1, 2],
      collapsedWindowIds: [10, 12],
      windowNames: { 10: 'Research', 12: 'Work' }
    });
  });

  it('uses defaults for invalid preference values', () => {
    expect(
      normalizePreferences({
        contentWidth: 'wide',
        density: 'large',
        windowScope: { kind: 'bad' },
        collapsedGroupIds: ['x'],
        collapsedWindowIds: ['x'],
        windowNames: ['bad']
      })
    ).toEqual({
      contentWidth: 'full',
      density: 'comfortable',
      windowScope: { kind: 'current' },
      collapsedGroupIds: [],
      collapsedWindowIds: [],
      windowNames: {}
    });
  });
});
