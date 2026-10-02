import { describe, expect, it } from 'vitest';
import { issueAgentConfirmation, consumeAgentConfirmation } from './confirmation';
import type { AgentPlan } from './plan';

const plan: AgentPlan = {
  planId: 'plan-1', planHash: 'hash-1', baseRevision: 'rev-1', baseRevisionInput: 'input', contextTabIds: [1],
  operations: [], highRisk: false, crossWindow: false, summary: 'Review'
};

describe('Agent confirmation', () => {
  it('binds a one-time confirmation to plan, context, revision and config', () => {
    const confirmation = issueAgentConfirmation(plan, 'config-1', 1000);
    consumeAgentConfirmation(confirmation, plan, 'config-1', 1001);
    expect(() => consumeAgentConfirmation(confirmation, plan, 'config-1', 1002)).toThrow('already been used');
  });

  it('rejects a changed plan or expired confirmation', () => {
    const confirmation = issueAgentConfirmation(plan, 'config-1', 1000);
    expect(() => consumeAgentConfirmation(confirmation, { ...plan, planHash: 'changed' }, 'config-1', 1001)).toThrow('does not match');
    expect(() => consumeAgentConfirmation({ ...confirmation, expiresAt: 1000 }, plan, 'config-1', 1001)).toThrow('expired');
  });
});
