import { createChromeBrowserTabsApi, type BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { IndexedDbOperationJournalStore, OperationJournal } from '../codex/operationJournal';
import {
  handleCodexReadRequest,
  isCodexRuntimeBridgeMessage,
  type CodexReadBrowserApi
} from '../codex/readService';
import { createRpcError } from '../codex/protocol';

export function registerBackgroundListeners(
  api: CodexReadBrowserApi & Partial<BrowserTabsApi> = createChromeBrowserTabsApi(),
  journal = new OperationJournal(new IndexedDbOperationJournalStore())
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

    void handleCodexReadRequest(message.request, api, journal)
      .then(sendResponse)
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
