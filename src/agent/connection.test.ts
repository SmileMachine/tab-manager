import { describe, expect, it, vi } from 'vitest';
import { checkAgentConnection } from './connection';
import type { StoredAgentConnection } from './config';

const connection: StoredAgentConnection = { apiRoot: 'https://provider.example/v1', modelId: 'organizer', configId: 'config-1', hasApiKey: true, apiKey: 'secret', keyRetention: 'session' };

describe('Agent connection checks', () => {
  it('uses the fixed Responses destination and synthetic capability input', async () => {
    const first = 'event: response.output_item.done\ndata: {"type":"function_call","call_id":"call-1","name":"capability_check","arguments":"{}"}\n\n';
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(first, { status: 200 }))
      .mockResolvedValueOnce(new Response('event: response.output_text.delta\ndata: {"delta":"OK"}\n\n', { status: 200 }));
    const result = await checkAgentConnection('capability', connection, fetch);
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe('https://provider.example/v1/responses');
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toMatchObject({ store: false, stream: true });
    expect(JSON.parse(fetch.mock.calls[1][1].body as string).input.at(-1)).toMatchObject({ type: 'function_call_output', call_id: 'call-1' });
  });


  it('accepts standard Responses output item events with nested function calls', async () => {
    const first = 'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call-2","name":"capability_check","arguments":"{}"}}\n\n';
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(first, { status: 200 }))
      .mockResolvedValueOnce(new Response('data: {"type":"response.output_text.delta","delta":"OK"}\n\n', { status: 200 }));
    const result = await checkAgentConnection('capability', connection, fetch);
    expect(result.ok).toBe(true);
    expect(JSON.parse(fetch.mock.calls[1][1].body as string).input.at(-1)).toMatchObject({ type: 'function_call_output', call_id: 'call-2' });
  });

  it('accepts a non-stream JSON response containing a function call', async () => {
    const first = JSON.stringify({ output: [{ type: 'function_call', call_id: 'call-3', name: 'capability_check', arguments: '{}' }] });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(first, { status: 200 }))
      .mockResolvedValueOnce(new Response('{"output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}', { status: 200 }));
    const result = await checkAgentConnection('capability', connection, fetch);
    expect(result.ok).toBe(true);
  });

  it('reports plain text capability responses as incompatible', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    await expect(checkAgentConnection('capability', connection, fetch)).resolves.toMatchObject({ ok: false });
  });
});
