import { describe, expect, it } from 'vitest';

import { defaultSnapshotName, uniqueSnapshotName } from './snapshotTime';

describe('snapshotTime', () => {
  it('formats local time to seconds', () => {
    expect(defaultSnapshotName(new Date(2026, 8, 2, 3, 4, 5))).toBe('2026-09-02 03:04:05');
  });

  it('adds a suffix for duplicate names', () => {
    expect(uniqueSnapshotName('2026-09-02 03:04:05', ['2026-09-02 03:04:05', '2026-09-02 03:04:05 (2)'])).toBe('2026-09-02 03:04:05 (3)');
  });
});
