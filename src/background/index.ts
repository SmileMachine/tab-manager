import { createChromeBrowserTabsApi, type BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { IndexedDbOperationJournalStore, OperationJournal } from '../codex/operationJournal';
import { createChromeTabContentInspector, type TabContentInspector } from '../codex/tabContentInspector';
import { BrowserEventCursor } from '../codex/eventCursor';
import { createCodexRequestDispatcher } from '../codex/requestDispatcher';
import {
  connectNativeCodexBridge,
  createChromeNativeMessagingConnection,
  type NativeCodexBridge
} from '../codex/nativeMessaging';
import { createRpcError } from '../codex/protocol';
import { isCodexRuntimeBridgeMessage } from '../codex/readService';

export const DEFAULT_NATIVE_MESSAGING_HOST = 'com.shawn.tab_group.codex';

export interface BackgroundListenerOptions {
  nativeMessagingHostName?: string;
  nativeMessagingAuthToken?: string;
}

export interface BackgroundListeners {
  nativeBridge?: NativeCodexBridge;
}

export function registerBackgroundListeners(
  api: BrowserTabsApi = createChromeBrowserTabsApi(),
  journal = new OperationJournal(new IndexedDbOperationJournalStore()),
  contentInspector: TabContentInspector = createChromeTabContentInspector(),
  eventCursor = new BrowserEventCursor(),
  options: BackgroundListenerOptions = {}
): BackgroundListeners {
  const dispatch = createCodexRequestDispatcher({ api, journal, contentInspector, eventCursor });
  const notifyManagerStateChanged = (eventType = 'browser.state-changed') => {
    eventCursor.append(eventType);
    void chrome.runtime.sendMessage({ type: 'browser-state-changed' }).catch(() => {
      // No manager page is listening.
    });
  };

  chrome.tabs.onCreated.addListener(() => notifyManagerStateChanged('tabs.created'));
  chrome.tabs.onRemoved.addListener(() => notifyManagerStateChanged('tabs.removed'));
  chrome.tabs.onMoved.addListener(() => notifyManagerStateChanged('tabs.moved'));
  chrome.tabs.onUpdated.addListener(() => notifyManagerStateChanged('tabs.updated'));
  chrome.tabs.onAttached.addListener(() => notifyManagerStateChanged('tabs.attached'));
  chrome.tabs.onDetached.addListener(() => notifyManagerStateChanged('tabs.detached'));
  chrome.windows.onCreated.addListener(() => notifyManagerStateChanged('windows.created'));
  chrome.windows.onRemoved.addListener(() => notifyManagerStateChanged('windows.removed'));
  chrome.tabGroups.onCreated.addListener(() => notifyManagerStateChanged('groups.created'));
  chrome.tabGroups.onUpdated.addListener(() => notifyManagerStateChanged('groups.updated'));
  chrome.tabGroups.onRemoved.addListener(() => notifyManagerStateChanged('groups.removed'));

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isCodexRuntimeBridgeMessage(message) || sender.id !== chrome.runtime.id) {
      return undefined;
    }

    void dispatch(message.request)
      .then(sendResponse)
      .catch((error) => {
        sendResponse(
          createRpcError('unknown', {
            code: 'operation-failed',
            message: error instanceof Error ? error.message : 'Unable to handle Codex request.'
          })
        );
      });

    return true;
  });

  const nativeBridge = connectNativeCodexBridge({
    hostName: options.nativeMessagingHostName ?? DEFAULT_NATIVE_MESSAGING_HOST,
    connection: createChromeNativeMessagingConnection(),
    dispatch,
    authToken: options.nativeMessagingAuthToken
  });

  return { nativeBridge };
}
