import { describe, expect, it } from 'vitest';

import { reconcileSelection, selectionStateForGroup, setGroupSelection, toggleTabSelection } from './selection';

describe('selection', () => {
  it('toggles a tab by tab id', () => {
    expect([...toggleTabSelection(new Set([1]), 2)]).toEqual([1, 2]);
    expect([...toggleTabSelection(new Set([1, 2]), 2)]).toEqual([1]);
  });

  it('selects and clears a whole group', () => {
    expect([...setGroupSelection(new Set([1]), [2, 3], true)]).toEqual([1, 2, 3]);
    expect([...setGroupSelection(new Set([1, 2, 3]), [2, 3], false)]).toEqual([1]);
  });

  it('reports unchecked mixed and checked group states', () => {
    expect(selectionStateForGroup(new Set(), [2, 3])).toBe('unchecked');
    expect(selectionStateForGroup(new Set([2]), [2, 3])).toBe('mixed');
    expect(selectionStateForGroup(new Set([2, 3]), [2, 3])).toBe('checked');
  });

  it('keeps only selected tabs that still exist after refresh', () => {
    expect([...reconcileSelection(new Set([1, 2, 3]), [1, 3])]).toEqual([1, 3]);
  });
});
