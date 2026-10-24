import { describe, expect, it, vi } from 'vitest';

import { connectNativeCodexBridge, type NativeMessage, type NativeMessagingPort } from './nativeMessaging';
import type { CodexRpcResponse } from './protocol';

const request = { protocolVersion: '1.0' as const, requestId: 'request-1', method: 'tab_group.get_snapshot' as const };

describe('connectNativeCodexBridge', () => {
  it('dispatches authenticated native requests and returns protocol responses', async () => {
    const port = fakePort();
    const response: CodexRpcResponse = { protocolVersion: '1.0', requestId: 'request-1', result: { ok: true } };
    const bridge = connectNativeCodexBridge({
      hostName: 'com.tab_group.codex',
      connection: { connect: vi.fn().mockReturnValue(port) },
      authToken: 'secret',
      dispatch: vi.fn().mockResolvedValue(response)
    });

    port.emit({ protocolVersion: '1.0', kind: 'request', authToken: 'secret', request });
    await Promise.resolve();

    expect(bridge?.hostName).toBe('com.tab_group.codex');
    expect(port.postMessage).toHaveBeenCalledWith({ protocolVersion: '1.0', kind: 'response', response });
  });

  it('rejects unauthenticated or malformed messages without dispatching them', async () => {
    const port = fakePort();
    const dispatch = vi.fn();
    connectNativeCodexBridge({ hostName: 'com.tab_group.codex', connection: { connect: () => port }, authToken: 'secret', dispatch });

    port.emit({ protocolVersion: '1.0', kind: 'request', authToken: 'wrong', request });
    await Promise.resolve();

    expect(dispatch).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ response: expect.objectContaining({ error: { code: 'invalid-request', message: expect.any(String) } }) }));
  });
});

function fakePort() {
  let listener: ((message: unknown) => void) | undefined;
  const port: NativeMessagingPort & { emit(message: NativeMessage | unknown): void } = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: (next) => { listener = next; } },
    onDisconnect: { addListener: vi.fn() },
    emit: (message) => listener?.(message)
  };
  return port;
}

describe('native retry policy', () => {
  it('backs off failures and close cancels pending reconnects', async () => {
    vi.useFakeTimers();
    const connect = vi.fn(() => { throw Error('host not installed'); });
    const onStatus = vi.fn();
    const bridge = connectNativeCodexBridge({ hostName: 'host', connection: { connect }, dispatch: vi.fn(), onStatus });
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(connect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenCalledWith({ state: 'unavailable', message: 'host not installed' });
    bridge?.close();
    await vi.advanceTimersByTimeAsync(120000);
    expect(connect).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
