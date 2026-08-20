import { describe, expect, it, vi } from 'vitest';

import { CODEX_PROTOCOL_VERSION } from './protocol';
import { CODEX_BRIDGE_MESSAGE_TYPE, handleCodexReadRequest, isCodexRuntimeBridgeMessage } from './readService';
import type { BrowserSnapshot } from '../domain/types';

describe('handleCodexReadRequest', () => {
  it('returns capabilities without reading browser state', async () => {
    const api = { loadSnapshot: vi.fn() };
    const response = await handleCodexReadRequest(request('tab_group.get_capabilities'), api);

    expect(response).toMatchObject({
      protocolVersion: CODEX_PROTOCOL_VERSION,
      requestId: 'request-1',
      result: {
        transport: 'extension-runtime',
        readMethods: expect.arrayContaining(['tab_group.get_snapshot', 'tab_group.export_workspace']),
        writeMethods: []
      }
    });
    expect(api.loadSnapshot).not.toHaveBeenCalled();
  });

  it('returns a grouping snapshot and filters tabs in native order', async () => {
    const api = { loadSnapshot: vi.fn().mockResolvedValue(snapshot()) };
    const response = await handleCodexReadRequest(
      request('tab_group.list_tabs', { hostname: 'docs.example.test', fieldSet: 'grouping' }),
      api
    );

    expect(response).toMatchObject({
      result: {
        tabs: [
          { id: 10, index: 0, hostname: 'docs.example.test' },
          { id: 12, index: 2, hostname: 'docs.example.test' }
        ]
      }
    });
    expect((response as { result: { tabs: Array<Record<string, unknown>> } }).result.tabs[0]).not.toHaveProperty('favIconUrl');
  });

  it('returns a typed missing-tab error', async () => {
    const response = await handleCodexReadRequest(request('tab_group.get_tab', { tabId: 404 }), {
      loadSnapshot: vi.fn().mockResolvedValue(snapshot())
    });

    expect(response).toEqual({
      protocolVersion: CODEX_PROTOCOL_VERSION,
      requestId: 'request-1',
      error: { code: 'not-found', message: 'No tab exists for id 404.' }
    });
  });

  it('exports a portable workspace without browser ids', async () => {
    const response = await handleCodexReadRequest(request('tab_group.export_workspace'), {
      loadSnapshot: vi.fn().mockResolvedValue(snapshot())
    });

    expect(response).toMatchObject({
      result: {
        workspace: {
          schemaVersion: 1,
          windows: [
            {
              localId: 'window-0',
              groups: [{ localId: 'group-0-0', tabLocalIds: ['tab-0-0', 'tab-0-2'] }]
            }
          ]
        }
      }
    });
  });

  it('rejects unsupported field sets and handles browser failures as typed responses', async () => {
    const invalid = await handleCodexReadRequest(request('tab_group.get_snapshot', { fieldSet: 'everything' }), {
      loadSnapshot: vi.fn()
    });
    const failed = await handleCodexReadRequest(request('tab_group.get_snapshot'), {
      loadSnapshot: vi.fn().mockRejectedValue(new Error('tabs permission denied'))
    });

    expect(invalid).toMatchObject({ error: { code: 'invalid-params' } });
    expect(failed).toMatchObject({ error: { code: 'operation-failed', message: 'tabs permission denied' } });
  });
});

describe('isCodexRuntimeBridgeMessage', () => {
  it('only accepts the internal bridge envelope', () => {
    expect(isCodexRuntimeBridgeMessage({ type: CODEX_BRIDGE_MESSAGE_TYPE, request: request('tab_group.get_snapshot') })).toBe(true);
    expect(isCodexRuntimeBridgeMessage({ type: 'browser-state-changed' })).toBe(false);
  });
});

function request(method: string, params?: unknown) {
  return {
    protocolVersion: CODEX_PROTOCOL_VERSION,
    requestId: 'request-1',
    method,
    ...(params === undefined ? {} : { params })
  };
}

function snapshot(): BrowserSnapshot {
  return {
    windows: [{ id: 1, focused: true, type: 'normal' }],
    tabs: [
      tab({ id: 12, index: 2, title: 'Reference', url: 'https://docs.example.test/reference', hostname: 'docs.example.test' }),
      tab({ id: 11, index: 1, title: 'Search', url: 'https://search.example.test/?q=docs', hostname: 'search.example.test', groupId: -1 }),
      tab({
        id: 10,
        index: 0,
        title: 'Guide',
        url: 'https://docs.example.test/guide',
        hostname: 'docs.example.test',
        favIconUrl: 'https://docs.example.test/icon.ico'
      })
    ],
    groups: [{ id: 3, windowId: 1, title: 'Docs', color: 'blue', collapsed: false }]
  };
}

function tab(overrides: Partial<BrowserSnapshot['tabs'][number]>): BrowserSnapshot['tabs'][number] {
  return {
    id: 1,
    windowId: 1,
    index: 0,
    groupId: 3,
    title: 'Untitled',
    url: 'https://example.test',
    pinned: false,
    active: false,
    audible: false,
    hostname: 'example.test',
    origin: 'https://example.test',
    protocol: 'https',
    pathname: '/',
    isNewTab: false,
    isInternalPage: false,
    isPdf: false,
    ...overrides
  };
}
