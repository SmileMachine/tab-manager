import { createChromeBrowserTabsApi, type BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { IndexedDbOperationJournalStore, OperationJournal } from '../codex/operationJournal';
import { createChromeTabContentInspector, type TabContentInspector } from '../codex/tabContentInspector';
import {
  handleCodexReadRequest,
  isCodexRuntimeBridgeMessage
} from '../codex/readService';
import { createRpcError } from '../codex/protocol';
import { CODEX_WRITE_METHODS, handleCodexWriteRequest, isCodexWriteMethod } from '../codex/writeService';

export function registerBackgroundListeners(
  api: BrowserTabsApi = createChromeBrowserTabsApi(),
  journal = new OperationJournal(new IndexedDbOperationJournalStore()),
  contentInspector: TabContentInspector = createChromeTabContentInspector()
) {
  const notifyManagerStateChanged = () => {
    chrome.runtime.sendMessage({ type: 'browser-state-changed' }).catch(() => {
      // No manager page is listening.
    });
  };

  chrome.tabs.onCreated.addListener(notifyManagerStateChanged);
  chrome.tabs.onRemoved.addListener(notifyManagerStateChanged);
  chrome.tabs.onMoved.addListener(notifyManagerStateChanged);
  chrome.tabs.onUpdated.addListener(notifyManagerStateChanged);
  chrome.tabs.onAttached.addListener(notifyManagerStateChanged);
  chrome.tabs.onDetached.addListener(notifyManagerStateChanged);
  chrome.windows.onCreated.addListener(notifyManagerStateChanged);
  chrome.windows.onRemoved.addListener(notifyManagerStateChanged);
  chrome.tabGroups.onCreated.addListener(notifyManagerStateChanged);
  chrome.tabGroups.onUpdated.addListener(notifyManagerStateChanged);
  chrome.tabGroups.onRemoved.addListener(notifyManagerStateChanged);

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isCodexRuntimeBridgeMessage(message)) {
      return undefined;
    }

    const response = isCodexWriteMethod(message.request)
      ? handleCodexWriteRequest(message.request, { api, journal })
      : handleCodexReadRequest(message.request, api, journal, contentInspector, CODEX_WRITE_METHODS);

    void response.then(sendResponse)
      .catch((error) => {
        sendResponse(
          createRpcError('unknown', {
            code: 'operation-failed',
            message: error instanceof Error ? error.message : 'Unable to read browser state.'
          })
        );
      });

    return true;
  });
}
