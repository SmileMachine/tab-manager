import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDevelopmentControl, type DevelopmentPort } from './nativeControl';
const config = { browser: 'edge' as const, installation: 'a'.repeat(32), generation: 'old', mode: 'standalone' as const, token: 'b'.repeat(64) };
function setup() {
  let receive = (_message: unknown) => {};
  let disconnect = () => {};
  const port: DevelopmentPort = { postMessage: vi.fn(), disconnect: vi.fn(), onMessage: { addListener: fn => { receive = fn; } }, onDisconnect: { addListener: fn => { disconnect = fn; } } };
  const runtime = { id: 'c'.repeat(32), reload: vi.fn(), connectNative: vi.fn(() => port) };
  const controller = startDevelopmentControl(config, runtime);
  const message = { protocolVersion: 1, kind: 'development-reload', requestId: 'request', target: { browser: config.browser, installation: config.installation, extensionId: runtime.id }, token: config.token, generation: 'new', mode: 'development' };
  return { port, runtime, controller, message, receive: (msg: unknown) => receive(msg), disconnect: () => disconnect() };
}
afterEach(() => vi.useRealTimers());
describe('local development control', () => {
  it('announces its runtime and accepts an authorized reload only once', async () => {
    vi.useFakeTimers();
    const s = setup();
    expect(s.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'development-ready', generation: 'old' }));
    s.receive(s.message); s.receive(s.message);
    expect(s.runtime.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(s.runtime.reload).toHaveBeenCalledTimes(1);
    s.controller.close();
  });
  it('ignores business messages, bad credentials, wrong targets', async () => {
    vi.useFakeTimers();
    const s = setup();
    s.receive({ ...s.message, kind: 'request' });
    s.receive({ ...s.message, token: 'wrong' });
    s.receive({ ...s.message, target: { ...s.message.target, browser: 'chrome' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.runtime.reload).not.toHaveBeenCalled();
    s.controller.close();
  });
  it('cancels reconnect and reload on close', async () => {
    vi.useFakeTimers();
    const s = setup(); s.disconnect(); s.controller.close();
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.runtime.connectNative).toHaveBeenCalledTimes(1);
    const t = setup(); t.receive(t.message); t.controller.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.runtime.reload).not.toHaveBeenCalled();
  });
});
