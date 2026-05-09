import { describe, expect, it } from 'vitest';

import { normalizePreferences } from './preferences';

describe('normalizePreferences', () => {
  it('keeps valid stable preferences', () => {
    expect(
      normalizePreferences({
        contentWidth: 'readable',
        density: 'compact',
        windowScope: { kind: 'all' },
        collapsedGroupIds: [1, 2]
      })
    ).toEqual({
      contentWidth: 'readable',
      density: 'compact',
      windowScope: { kind: 'all' },
      collapsedGroupIds: [1, 2]
    });
  });

  it('uses defaults for invalid preference values', () => {
    expect(
      normalizePreferences({
        contentWidth: 'wide',
        density: 'large',
        windowScope: { kind: 'bad' },
        collapsedGroupIds: ['x']
      })
    ).toEqual({
      contentWidth: 'full',
      density: 'comfortable',
      windowScope: { kind: 'current' },
      collapsedGroupIds: []
    });
  });
});
