import { describe, expect, it, vi } from 'vitest';
import type { BrowserSnapshot } from '../domain/types';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { issueAgentConfirmation } from './confirmation';
import { createSnapshotRevision } from '../codex/snapshot';
import { applyAgentPlan } from './executor';
import type { AgentPlan } from './plan';

const snapshot: BrowserSnapshot = {
  windows: [{ id: 1, focused: true, type: 'normal' }],
  tabs: [{ id: 1, windowId: 1, index: 0, groupId: -1, title: 'A', pinned: false, active: true, audible: false }],
  groups: []
};

const currentRevision = createSnapshotRevision(snapshot);
const plan: AgentPlan = {
  planId: 'plan-1', planHash: 'hash-1', baseRevision: currentRevision, baseRevisionInput: 'input', scopeTabIds: [1],
  operations: [{ kind: 'close-tabs', tabIds: [1], reason: 'duplicate' }], highRisk: true, crossWindow: false, summary: 'Close duplicate'
};

describe('Agent executor', () => {
  it('requires confirmation and checks the reviewed revision before writing', async () => {
    const api = { loadSnapshot: vi.fn().mockResolvedValue(snapshot), closeTabs: vi.fn() } as unknown as BrowserTabsApi;
    await expect(applyAgentPlan(api, plan, { confirmation: issueAgentConfirmation(plan, 'config-1'), configId: 'config-1', confirmHighRisk: false })).rejects.toThrow('high-risk');
    await expect(applyAgentPlan(api, { ...plan, baseRevision: 'stale-revision' }, { confirmation: issueAgentConfirmation({ ...plan, baseRevision: 'stale-revision' }, 'config-1'), configId: 'config-1', confirmHighRisk: true })).rejects.toThrow('browser changed');
    expect(api.closeTabs).not.toHaveBeenCalled();
  });

  it('applies a confirmed grouping plan through the exclusive API', async () => {
    const groupedPlan: AgentPlan = { ...plan, baseRevision: currentRevision, highRisk: false, operations: [{ kind: 'create-group', tabIds: [1], windowId: 1, title: 'Work', color: 'blue', reason: 'topic' }] };
    const api = { loadSnapshot: vi.fn().mockResolvedValue(snapshot), createGroup: vi.fn().mockResolvedValue(4), runExclusive: vi.fn(async (action: (api: BrowserTabsApi) => Promise<unknown>) => action(api)) } as unknown as BrowserTabsApi;
    const result = await applyAgentPlan(api, groupedPlan, { confirmation: issueAgentConfirmation(groupedPlan, 'config-1'), configId: 'config-1', confirmHighRisk: false });
    expect(result.status).toBe('succeeded');
    expect(api.createGroup).toHaveBeenCalledWith([1], 1, 'Work', 'blue');
  });
});
