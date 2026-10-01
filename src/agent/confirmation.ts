import type { AgentPlan } from './plan';

export interface AgentConfirmation {
  confirmationId: string;
  planHash: string;
  scopeTabIds: number[];
  baseRevision: string;
  configId: string;
  issuedAt: number;
  expiresAt: number;
}

const MAX_CONFIRMATION_AGE_MS = 5 * 60 * 1000;
const usedConfirmationIds = new Set<string>();

export function issueAgentConfirmation(plan: AgentPlan, configId: string, now = Date.now()): AgentConfirmation {
  return {
    confirmationId: `agent-confirmation:${crypto.randomUUID()}`,
    planHash: plan.planHash,
    scopeTabIds: [...plan.scopeTabIds],
    baseRevision: plan.baseRevision,
    configId,
    issuedAt: now,
    expiresAt: now + MAX_CONFIRMATION_AGE_MS
  };
}

export function consumeAgentConfirmation(
  confirmation: AgentConfirmation,
  plan: AgentPlan,
  configId: string,
  now = Date.now()
): void {
  if (usedConfirmationIds.has(confirmation.confirmationId)) throw new Error('This Agent confirmation has already been used.');
  if (confirmation.expiresAt < now || confirmation.expiresAt - confirmation.issuedAt > MAX_CONFIRMATION_AGE_MS) {
    throw new Error('This Agent confirmation has expired.');
  }
  if (confirmation.planHash !== plan.planHash || confirmation.baseRevision !== plan.baseRevision || confirmation.configId !== configId ||
    !sameIds(confirmation.scopeTabIds, plan.scopeTabIds)) {
    throw new Error('The Agent confirmation does not match the reviewed proposal.');
  }
  usedConfirmationIds.add(confirmation.confirmationId);
}

function sameIds(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
