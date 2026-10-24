import { createChromeBrowserTabsApi, type BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { createBrowserCommandCoordinator } from './browserCommandCoordinator';
import { isBrowserCommand, isBrowserCommandMessage, type BrowserCommandMessage, type BrowserCommandResponse } from '../infrastructure/browserCommandProtocol';
import { isAgentContentMessage, type AgentContentMessage } from '../agent/contentProtocol';
import { loadAgentPrivacySettings } from '../agent/storage';
import { IndexedDbOperationJournalStore, OperationJournal } from '../codex/operationJournal';
import { createChromeTabContentInspector, type TabContentInspector } from '../codex/tabContentInspector';
import { BrowserEventCursor } from '../codex/eventCursor';
import { createCodexRequestDispatcher } from '../codex/requestDispatcher';
import {
  connectNativeCodexBridge,
  createChromeNativeMessagingConnection
} from '../codex/nativeMessaging';
import { startNativeIntegration, NATIVE_INTEGRATION_ENABLED_KEY, NATIVE_INTEGRATION_STATUS_KEY } from '../codex/nativeIntegration';
import { createRpcError } from '../codex/protocol';
import { isCodexRuntimeBridgeMessage } from '../codex/readService';
import {
  MOVE_CURRENT_TAB_OPEN_MODE,
  OPEN_MOVE_CURRENT_TAB_COMMAND,
  POPUP_OPEN_MODE_STORAGE_KEY
} from '../popup/shortcut';

export const DEFAULT_NATIVE_MESSAGING_HOST = 'com.shawn.tab_group.codex';

export interface BackgroundListenerOptions {
  nativeMessagingHostName?: string;
  nativeMessagingAuthToken?: string;
}

export interface BackgroundListeners {
  nativeIntegration: ReturnType<typeof startNativeIntegration>;
}

interface PopupMoveTabToGroupMessage {
  type: 'popup.move-tab-to-group';
  tabId: number;
  targetGroupId: number;
  targetWindowId: number;
}

function isPopupMoveTabToGroupMessage(message: unknown): message is PopupMoveTabToGroupMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<PopupMoveTabToGroupMessage>;
  return (
    candidate.type === 'popup.move-tab-to-group' &&
    typeof candidate.tabId === 'number' &&
    typeof candidate.targetGroupId === 'number' &&
    typeof candidate.targetWindowId === 'number'
  );
}

export function registerBackgroundListeners(
  api: BrowserTabsApi = createChromeBrowserTabsApi(),
  journal = new OperationJournal(new IndexedDbOperationJournalStore()),
  contentInspector: TabContentInspector = createChromeTabContentInspector(),
  eventCursor = new BrowserEventCursor(),
  options: BackgroundListenerOptions = {}
): BackgroundListeners {
  const coordinator = createBrowserCommandCoordinator(api, journal);
  const dispatch = (request: unknown) => coordinator.runExclusiveRaw((scoped) =>
    createCodexRequestDispatcher({ api: scoped, journal, contentInspector, eventCursor })(request)
  );
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

  chrome.commands?.onCommand.addListener((command) => {
    if (command !== OPEN_MOVE_CURRENT_TAB_COMMAND || !chrome.storage?.session || !chrome.action?.openPopup) {
      return;
    }

    void chrome.storage.session
      .set({ [POPUP_OPEN_MODE_STORAGE_KEY]: MOVE_CURRENT_TAB_OPEN_MODE })
      .then(() => chrome.action.openPopup())
      .catch(() => {
        // The browser may reject opening a popup when the action is unavailable.
      });
  });

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    console.debug('[tab-group] Runtime message received.', {
      messageType: isRecord(message) ? message.type : undefined,
      senderId: sender.id,
      senderUrl: sender.url
    });
    // Some Edge/WXT development contexts omit sender.id even though the message
    // originates from an extension page. Reject only an explicitly different ID;
    // silently returning here closes the message port without any diagnostic.
    if (sender.id && sender.id !== chrome.runtime.id) {
      console.warn('[tab-group] Rejected browser message from another extension.', {
        senderId: sender.id,
        messageType: isRecord(message) ? message.type : undefined
      });
      sendResponse({ ok: false, error: 'The message sender is not this extension.' });
      return true;
    }

    if (isBrowserCommandMessage(message)) {
      void handleBrowserCommandMessage(message, coordinator)
        .then((response) => sendResponse(response))
        .catch((error) => {
          console.error('[tab-group] Browser command handler failed.', {
            requestId: message.requestId,
            action: message.action,
            command: message.command,
            error
          });
          sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Unable to execute browser command.' });
        });
      return true;
    }

    if (isAgentContentMessage(message)) {
      void handleAgentContentMessage(message, contentInspector, sendResponse);
      return true;
    }

    if (isPopupMoveTabToGroupMessage(message)) {
      void coordinator.executeCommand({ kind: 'moveTabToGroup', tabId: message.tabId, targetGroupId: message.targetGroupId, targetWindowId: message.targetWindowId })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Unable to move tab to group.' }));
      return true;
    }

    if (!isCodexRuntimeBridgeMessage(message)) {
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

  const nativeIntegration = startNativeIntegration({
    readEnabled: async () => (await chrome.storage.local.get(NATIVE_INTEGRATION_ENABLED_KEY))[NATIVE_INTEGRATION_ENABLED_KEY] === true,
    onEnabledChanged(listener) {
      const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && NATIVE_INTEGRATION_ENABLED_KEY in changes) listener(changes[NATIVE_INTEGRATION_ENABLED_KEY].newValue === true);
      };
      chrome.storage.onChanged.addListener(changed);
      return () => chrome.storage.onChanged.removeListener(changed);
    },
    connect: (onStatus) => connectNativeCodexBridge({
      hostName: options.nativeMessagingHostName ?? DEFAULT_NATIVE_MESSAGING_HOST,
      connection: createChromeNativeMessagingConnection(),
      dispatch,
      authToken: options.nativeMessagingAuthToken,
      onStatus
    }),
    publish: (status) => { void chrome.storage.local.set({ [NATIVE_INTEGRATION_STATUS_KEY]: status }).catch(() => {}); }
  });

  return { nativeIntegration };
}


async function handleBrowserCommandMessage(
  message: BrowserCommandMessage,
  coordinator: ReturnType<typeof createBrowserCommandCoordinator>
): Promise<BrowserCommandResponse> {
  const source = message.source === 'agent' || message.source === 'codex' || message.source === 'import' || message.source === 'rollback'
    ? message.source
    : 'manager';
  console.debug('[tab-group] Browser command received.', {
    requestId: message.requestId,
    action: message.action,
    command: message.command?.kind,
    source
  });
  if (message.action === 'acquire') {
    return { ok: true, result: await coordinator.acquire(source) };
  }
  if (message.action === 'release') {
    if (!message.lockToken) return { ok: false, error: 'A browser command lock token is required.' };
    coordinator.release(message.lockToken);
    return { ok: true };
  }
  if (!isBrowserCommand(message.command)) return { ok: false, error: 'The browser command is invalid.' };
  if (message.lockToken) {
    // A token is an assertion that the caller owns the current compound boundary.
    // Invalid tokens must never be downgraded to an ordinary queued command.
    return coordinator.executeCommand(message.command, message.lockToken, source).then((result) => ({ ok: true, result }));
  }
  return coordinator.executeCommand(message.command, undefined, source).then((result) => ({ ok: true, result }));
}


async function handleAgentContentMessage(
  message: AgentContentMessage,
  contentInspector: TabContentInspector,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    // This check happens before calling the inspector. The inspector itself starts
    // with tabs.get and permission checks, so the disabled path must stop here.
    if (!(await loadAgentPrivacySettings()).allowPageContent) {
      sendResponse({ ok: false, error: 'privacy-tool-disabled' });
      return;
    }
    if (!Array.isArray(message.contextTabIds) || !message.contextTabIds.includes(message.tabId)) {
      sendResponse({ ok: false, error: 'tab-not-available' });
      return;
    }
    sendResponse({ ok: true, outcome: await contentInspector.inspectTab(message.tabId, message.options) });
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Unable to read page content.' });
  }
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
