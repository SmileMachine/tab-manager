import { describe, expect, it, vi } from 'vitest';

import { BrowserEventCursor } from './eventCursor';
import { dispatchCodexRequest } from './requestDispatcher';
import { InMemoryOperationJournalStore, OperationJournal } from './operationJournal';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';

const services = {
  api: { loadSnapshot: vi.fn().mockResolvedValue({ windows: [], tabs: [], groups: [] }) } as unknown as BrowserTabsApi,
  journal: new OperationJournal(new InMemoryOperationJournalStore()),
  contentInspector: { inspectTab: vi.fn(), inspectTabs: vi.fn() },
  eventCursor: new BrowserEventCursor()
};

describe('dispatchCodexRequest', () => {
  it('routes all request families through one service boundary', async () => {
    const response = await dispatchCodexRequest({ protocolVersion: '1.0', requestId: 'capabilities', method: 'tab_group.get_capabilities' }, services);
    expect(response).toMatchObject({ result: { protocolVersion: '1.0', readMethods: expect.any(Array), writeMethods: expect.any(Array) } });
  });

  it('returns invalid-request for non-protocol input', async () => {
    const response = await dispatchCodexRequest({ requestId: 'invalid' }, services);
    expect(response).toMatchObject({ error: { code: 'invalid-request' }, requestId: 'invalid' });
  });
});
