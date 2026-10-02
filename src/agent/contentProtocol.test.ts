import { describe, expect, it } from 'vitest';
import { isAgentContentMessage } from './contentProtocol';

describe('Agent content protocol', () => {
  it('requires an explicit frozen Agent context', () => {
    expect(isAgentContentMessage({ type: 'agent.read-page-content', requestId: '1', tabId: 1 })).toBe(false);
    expect(isAgentContentMessage({ type: 'agent.read-page-content', requestId: '1', tabId: 1, contextTabIds: [1] })).toBe(true);
  });
});
