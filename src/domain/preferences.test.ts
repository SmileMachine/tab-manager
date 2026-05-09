import { describe, expect, it } from 'vitest';

import { normalizePreferences } from './preferences';

describe('normalizePreferences', () => {
  it('keeps valid stable preferences', () => {
    expect(normalizePreferences({ density: 'compact', windowScope: { kind: 'all' }, collapsedGroupIds: [1, 2] })).toEqual({
      density: 'compact',
      windowScope: { kind: 'all' },
      collapsedGroupIds: [1, 2]
    });
  });

  it('uses defaults for invalid preference values', () => {
    expect(normalizePreferences({ density: 'large', windowScope: { kind: 'bad' }, collapsedGroupIds: ['x'] })).toEqual({
      density: 'comfortable',
      windowScope: { kind: 'current' },
      collapsedGroupIds: []
    });
  });
});
