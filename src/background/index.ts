import { createChromeBrowserTabsApi, type BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { IndexedDbOperationJournalStore, OperationJournal } from '../codex/operationJournal';
import { createChromeTabContentInspector, type TabContentInspector } from '../codex/tabContentInspector';
import {
  handleCodexReadRequest,
  isCodexRuntimeBridgeMessage
} from '../codex/readService';
import { createRpcError, isCodexRpcRequest } from '../codex/protocol';
import { handleCodexRollbackRequest, isCodexRollbackMethod } from '../codex/rollbackService';
import { handleCodexImportRequest, isCodexImportMethod } from '../codex/importService';
import { BrowserEventCursor } from '../codex/eventCursor';
import { CODEX_WRITE_METHODS, handleCodexWriteRequest, isCodexWriteMethod } from '../codex/writeService';

export function registerBackgroundListeners(
  api: BrowserTabsApi = createChromeBrowserTabsApi(),
  journal = new OperationJournal(new IndexedDbOperationJournalStore()),
  contentInspector: TabContentInspector = createChromeTabContentInspector(),
  eventCursor = new BrowserEventCursor()
) {
  const notifyManagerStateChanged = (eventType = 'browser.state-changed') => {
    eventCursor.append(eventType);
    chrome.runtime.sendMessage({ type: 'browser-state-changed' }).catch(() => {
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

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isCodexRuntimeBridgeMessage(message)) {
      return undefined;
    }

    const response = isCodexRpcRequest(message.request) && isCodexRollbackMethod(message.request.method)
      ? handleCodexRollbackRequest(message.request, { api, journal })
      : isCodexRpcRequest(message.request) && isCodexImportMethod(message.request.method)
        ? handleCodexImportRequest(message.request, { api, journal })
        : isCodexWriteMethod(message.request)
        ? handleCodexWriteRequest(message.request, { api, journal })
        : handleCodexReadRequest(message.request, api, journal, contentInspector, CODEX_WRITE_METHODS, eventCursor);

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
