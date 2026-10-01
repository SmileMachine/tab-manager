import { describe, expect, it } from 'vitest';
import { buildAgentScopeMetadata } from './metadata';
import { validateAgentPlan } from './plan';
import type { BrowserSnapshotView } from '../domain/types';

const view: BrowserSnapshotView = {
  windows: [{
    id: 1, focused: true, type: 'normal',
    items: [{ kind: 'tab', tab: { id: 1, windowId: 1, index: 0, groupId: -1, title: 'A', pinned: false, active: true, audible: false } }], groupSpans: []
  }]
};

describe('Agent plan validation', () => {
  it('accepts only scoped, editable organization proposals', () => {
    const scope = buildAgentScopeMetadata(view, { kind: 'selected', tabIds: [1] });
    const plan = validateAgentPlan({ operations: [{ kind: 'create-group', tabIds: [1], windowId: 1, title: 'Work', reason: 'same topic' }] }, scope, new Map());
    expect(plan.operations[0]).toMatchObject({ kind: 'create-group', tabIds: [1] });
    expect(plan.highRisk).toBe(false);
  });

  it('rejects an out-of-scope or cross-window proposal', () => {
    const scope = buildAgentScopeMetadata(view, { kind: 'selected', tabIds: [1] });
    expect(() => validateAgentPlan({ operations: [{ kind: 'close-tabs', tabIds: [2] }] }, scope, new Map())).toThrow('frozen Agent scope');
    expect(() => validateAgentPlan({ operations: [{ kind: 'move-to-group', tabIds: [1], targetGroupId: 7, targetWindowId: 2 }] }, scope, new Map([[7, { windowId: 2, tabIds: [] }]]))).toThrow('Cross-window');
  });
});
