import { describe, expect, it } from 'vitest';
import { buildAgentContextMetadata } from './metadata';
import { validateAgentPlan } from './plan';
import type { BrowserSnapshotView } from '../domain/types';

const view: BrowserSnapshotView = {
  windows: [{
    id: 1, focused: true, type: 'normal',
    items: [{ kind: 'tab', tab: { id: 1, windowId: 1, index: 0, groupId: -1, title: 'A', pinned: false, active: true, audible: false } }], groupSpans: []
  }]
};

describe('Agent plan validation', () => {
  it('accepts only context-bound, editable organization proposals', () => {
    const context = buildAgentContextMetadata(view);
    const plan = validateAgentPlan({ operations: [{ kind: 'create-group', tabIds: [1], windowId: 1, title: 'Work', reason: 'same topic' }] }, context, new Map());
    expect(plan.operations[0]).toMatchObject({ kind: 'create-group', tabIds: [1] });
    expect(plan.highRisk).toBe(false);
  });

  it('rejects unknown tabs but permits cross-window organization', () => {
    const context = buildAgentContextMetadata(view);
    expect(() => validateAgentPlan({ operations: [{ kind: 'close-tabs', tabIds: [2] }] }, context, new Map())).toThrow('current Agent context');
    expect(validateAgentPlan({ operations: [{ kind: 'move-to-group', tabIds: [1], targetGroupId: 7, targetWindowId: 2 }] }, context, new Map([[7, { windowId: 2, tabIds: [] }]])).crossWindow).toBe(true);
  });
});
