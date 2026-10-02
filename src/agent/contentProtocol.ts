import type { ContentReadOptions, ContentInspectionOutcome } from '../codex/protocol';

export const AGENT_CONTENT_MESSAGE = 'agent.read-page-content';

export interface AgentContentMessage {
  type: typeof AGENT_CONTENT_MESSAGE;
  requestId: string;
  tabId: number;
  options?: ContentReadOptions;
  contextTabIds: number[];
}

export interface AgentContentResponse {
  ok: boolean;
  outcome?: ContentInspectionOutcome;
  error?: string;
}

export function isAgentContentMessage(value: unknown): value is AgentContentMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentContentMessage>;
  return candidate.type === AGENT_CONTENT_MESSAGE &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.tabId === 'number' &&
    Number.isInteger(candidate.tabId) &&
    Array.isArray(candidate.contextTabIds) &&
    candidate.contextTabIds.every((id) => typeof id === 'number' && Number.isInteger(id));
}
