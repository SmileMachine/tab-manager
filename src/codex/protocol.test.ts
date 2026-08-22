import { describe, expect, it } from 'vitest';

import { CODEX_PROTOCOL_VERSION, createRpcError, isCodexRpcRequest } from './protocol';

describe('Codex RPC protocol', () => {
  it('accepts a versioned tab-group request', () => {
    expect(
      isCodexRpcRequest({
        protocolVersion: CODEX_PROTOCOL_VERSION,
        requestId: 'request-1',
        method: 'tab_group.get_snapshot',
        params: { fieldSet: 'grouping' }
      })
    ).toBe(true);
  });

  it('rejects incomplete or incompatible requests', () => {
    expect(isCodexRpcRequest({ requestId: 'request-1', method: 'tab_group.get_snapshot' })).toBe(false);
    expect(
      isCodexRpcRequest({ protocolVersion: '2.0', requestId: 'request-1', method: 'tab_group.get_snapshot' })
    ).toBe(false);
  });

  it('creates typed error responses', () => {
    expect(createRpcError('request-1', { code: 'stale-state', message: 'Snapshot changed.' })).toEqual({
      protocolVersion: CODEX_PROTOCOL_VERSION,
      requestId: 'request-1',
      error: { code: 'stale-state', message: 'Snapshot changed.' }
    });
  });
});
