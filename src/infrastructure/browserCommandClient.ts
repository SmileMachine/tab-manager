import type { BrowserTabsApi } from './browserTabsApi';
import { browserCommandResult, type BrowserCommand, type BrowserCommandResponse } from './browserCommandProtocol';
import type { BrowserSnapshot, NativeGroupId, NativeTabId, NativeWindowId } from '../domain/types';
import type { OperationSource } from '../codex/protocol';

export function createBrowserCommandClient(options: { send?: (message: unknown) => Promise<unknown>; source?: OperationSource } = {}): BrowserTabsApi {
  const send = options.send ?? ((message: unknown) => chrome.runtime.sendMessage(message));
  const source = options.source ?? 'manager';
  let lockToken: string | undefined;

  async function call<T>(command: BrowserCommand): Promise<T> {
    const response = await send({
      type: 'browser-command', requestId: crypto.randomUUID(), action: 'execute', command, lockToken, source
    }) as BrowserCommandResponse;
    return browserCommandResult<T>(response);
  }

  const client: BrowserTabsApi = {
    loadSnapshot: () => call<BrowserSnapshot>({ kind: 'loadSnapshot' }),
    groupTabs: (tabIds, targetGroupId) => call<void>({ kind: 'groupTabs', tabIds, targetGroupId }),
    activateTab: (tabId, windowId) => call<void>({ kind: 'activateTab', tabId, windowId }),
    closeTabs: (tabIds) => call<void>({ kind: 'closeTabs', tabIds }),
    discardTabs: (tabIds) => call<void>({ kind: 'discardTabs', tabIds }),
    createGroup: (tabIds, windowId, title, color) => call<number>({ kind: 'createGroup', tabIds, windowId, title, color }),
    moveGroup: (groupId, targetWindowId, targetIndex) => call<void>({ kind: 'moveGroup', groupId, targetWindowId, targetIndex }),
    moveTab: (tabId, targetWindowId, targetIndex) => call<void>({ kind: 'moveTab', tabId, targetWindowId, targetIndex }),
    moveTabsToGroup: (tabIds, targetGroupId, targetWindowId) => call<void>({ kind: 'moveTabsToGroup', tabIds, targetGroupId, targetWindowId }),
    moveTabToGroup: (tabId, targetGroupId, targetWindowId) => call<void>({ kind: 'moveTabToGroup', tabId, targetGroupId, targetWindowId }),
    ungroupTabs: (tabIds) => call<void>({ kind: 'ungroupTabs', tabIds }),
    moveTabs: (tabIds, targetWindowId, targetIndex) => call<void>({ kind: 'moveTabs', tabIds, targetWindowId, targetIndex }),
    updateTab: (tabId, changes) => call<void>({ kind: 'updateTab', tabId, changes }),
    updateGroup: (groupId, changes) => call<void>({ kind: 'updateGroup', groupId, changes }),
    createTabs: (tabs) => call<number[]>({ kind: 'createTabs', tabs }),
    createWindow: (options) => call<number>({ kind: 'createWindow', options }),
    updateWindow: (windowId, changes) => call<void>({ kind: 'updateWindow', windowId, changes }),
    runExclusive: async <T>(action: (api: BrowserTabsApi) => Promise<T>) => {
      const acquired = await send({ type: 'browser-command', requestId: crypto.randomUUID(), action: 'acquire', source }) as BrowserCommandResponse;
      lockToken = browserCommandResult<string>(acquired);
      try {
        return await action(client);
      } finally {
        const token = lockToken;
        lockToken = undefined;
        await send({ type: 'browser-command', requestId: crypto.randomUUID(), action: 'release', lockToken: token, source });
      }
    }
  };
  return client;
}
