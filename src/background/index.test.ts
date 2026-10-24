import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBackgroundListeners } from './index';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { OperationJournal } from '../codex/operationJournal';
import type { TabContentInspector } from '../codex/tabContentInspector';
import { NATIVE_INTEGRATION_ENABLED_KEY } from '../codex/nativeIntegration';

afterEach(() => vi.unstubAllGlobals());
describe('background without a native host', () => {
  it('registers normal event handlers without connecting or scheduling native retries', async () => {
    const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
    const connectNative = vi.fn(() => { throw Error('No host installed'); });
    const storageChanged = event();
    const runtimeMessage = event();
    const tabs = Object.fromEntries(['onCreated','onRemoved','onMoved','onUpdated','onAttached','onDetached'].map(key => [key, event()]));
    const chrome = {
      tabs, windows: { onCreated: event(), onRemoved: event() }, tabGroups: { onCreated: event(), onRemoved: event(), onUpdated: event() },
      runtime: { onMessage: runtimeMessage, connectNative, sendMessage: vi.fn().mockResolvedValue(undefined) },
      storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) }, onChanged: storageChanged }
    };
    vi.stubGlobal('chrome', chrome);
    const background = registerBackgroundListeners({} as BrowserTabsApi, {} as OperationJournal, {} as TabContentInspector);
    await background.nativeIntegration.ready;
    expect(connectNative).not.toHaveBeenCalled();
    expect(runtimeMessage.addListener).toHaveBeenCalledTimes(1);
    expect(tabs.onCreated.addListener).toHaveBeenCalledTimes(1);
    const changed = storageChanged.addListener.mock.calls[0][0];
    changed({ [NATIVE_INTEGRATION_ENABLED_KEY]: { newValue: false } }, 'local');
    expect(connectNative).not.toHaveBeenCalled();
    background.nativeIntegration.close();
  });
});
