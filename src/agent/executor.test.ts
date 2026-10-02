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
  planId: 'plan-1', planHash: 'hash-1', baseRevision: currentRevision, baseRevisionInput: 'input', contextTabIds: [1],
  operations: [{ kind: 'close-tabs', tabIds: [1], reason: 'duplicate' }], highRisk: true, crossWindow: false, summary: 'Close duplicate'
};

function createApi(overrides: Partial<BrowserTabsApi> = {}): BrowserTabsApi {
  return {
    loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    closeTabs: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn().mockResolvedValue(4),
    moveTabsToGroup: vi.fn().mockResolvedValue(undefined),
    updateGroup: vi.fn().mockResolvedValue(undefined),
    discardTabs: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as BrowserTabsApi;
}

describe('Agent executor', () => {
  it('requires confirmation but does not block on a changed browser revision', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = createApi();
    await expect(applyAgentPlan(api, plan, { confirmation: issueAgentConfirmation(plan, 'config-1'), configId: 'config-1', confirmHighRisk: false })).rejects.toThrow('high-risk');

    const stalePlan = { ...plan, baseRevision: 'stale-revision' };
    const result = await applyAgentPlan(api, stalePlan, {
      confirmation: issueAgentConfirmation(stalePlan, 'config-1'), configId: 'config-1', confirmHighRisk: true
    });

    expect(result.status).toBe('succeeded');
    expect(api.closeTabs).toHaveBeenCalledWith([1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('revision changed'), expect.objectContaining({ planId: plan.planId }));
    warn.mockRestore();
  });

  it('skips an operation with missing tabs and continues with later operations', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const changingSnapshot = {
      ...snapshot,
      tabs: []
    };
    const api = createApi({
      loadSnapshot: vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce(changingSnapshot).mockResolvedValueOnce(snapshot).mockResolvedValueOnce(snapshot)
    });
    const groupedPlan: AgentPlan = {
      ...plan,
      highRisk: false,
      operations: [
        { kind: 'create-group', tabIds: [1], windowId: 1, title: 'Work', color: 'blue', reason: 'topic' },
        { kind: 'create-group', tabIds: [1], windowId: 1, title: 'Later', color: 'green', reason: 'topic' }
      ]
    };
    const result = await applyAgentPlan(api, groupedPlan, {
      confirmation: issueAgentConfirmation(groupedPlan, 'config-1'), configId: 'config-1', confirmHighRisk: false
    });
    expect(result.results[0]).toMatchObject({ status: 'skipped' });
    expect(result.results[1]).toMatchObject({ status: 'succeeded' });
    expect(api.createGroup).toHaveBeenCalledWith([1], 1, 'Later', 'green');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('operation skipped'), expect.objectContaining({ planId: plan.planId }));
    warn.mockRestore();
  });

  it('skips a missing target group without stopping other operations', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = createApi({
      loadSnapshot: vi.fn().mockResolvedValue({ ...snapshot, groups: [] })
    });
    const movePlan: AgentPlan = {
      ...plan,
      highRisk: false,
      operations: [
        { kind: 'move-to-group', tabIds: [1], targetGroupId: 7, targetWindowId: 1, targetGroupTitle: 'Work', reason: 'topic' },
        { kind: 'create-group', tabIds: [1], windowId: 1, title: 'Later', color: 'green', reason: 'topic' }
      ]
    };
    const result = await applyAgentPlan(api, movePlan, {
      confirmation: issueAgentConfirmation(movePlan, 'config-1'), configId: 'config-1', confirmHighRisk: false
    });
    expect(result.results[0]).toMatchObject({ status: 'skipped' });
    expect(result.results[1]).toMatchObject({ status: 'succeeded' });
    expect(api.createGroup).toHaveBeenCalledWith([1], 1, 'Later', 'green');
    warn.mockRestore();
  });

  it('logs a failed operation and continues with later operations', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = createApi({
      createGroup: vi.fn().mockRejectedValueOnce(new Error('browser rejected the group'))
        .mockResolvedValueOnce(4)
    });
    const groupedPlan: AgentPlan = {
      ...plan,
      highRisk: false,
      operations: [
        { kind: 'create-group', tabIds: [1], windowId: 1, title: 'First', color: 'blue', reason: 'topic' },
        { kind: 'create-group', tabIds: [1], windowId: 1, title: 'Second', color: 'green', reason: 'topic' }
      ]
    };
    const result = await applyAgentPlan(api, groupedPlan, {
      confirmation: issueAgentConfirmation(groupedPlan, 'config-1'), configId: 'config-1', confirmHighRisk: false
    });
    expect(result.status).toBe('partially-applied');
    expect(result.results).toEqual([
      { operationIndex: 0, kind: 'create-group', status: 'failed', message: 'browser rejected the group' },
      { operationIndex: 1, kind: 'create-group', status: 'succeeded', message: undefined }
    ]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('operation failed'), expect.objectContaining({ planId: plan.planId, message: 'browser rejected the group' }));
    error.mockRestore();
  });

  it('applies a confirmed grouping plan through the exclusive API', async () => {
    const groupedPlan: AgentPlan = { ...plan, baseRevision: currentRevision, highRisk: false, operations: [{ kind: 'create-group', tabIds: [1], windowId: 1, title: 'Work', color: 'blue', reason: 'topic' }] };
    const api = createApi();
    api.runExclusive = async <T>(action: (scoped: BrowserTabsApi) => Promise<T>) => action(api);
    const result = await applyAgentPlan(api, groupedPlan, { confirmation: issueAgentConfirmation(groupedPlan, 'config-1'), configId: 'config-1', confirmHighRisk: false });
    expect(result.status).toBe('succeeded');
    expect(api.createGroup).toHaveBeenCalledWith([1], 1, 'Work', 'blue');
  });
});
