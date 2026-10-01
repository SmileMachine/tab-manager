import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { createJournaledBrowserTabsApi } from '../infrastructure/journaledBrowserTabsApi';
import type { OperationJournal } from '../codex/operationJournal';
import type { BrowserCommand } from '../infrastructure/browserCommandProtocol';
import type { OperationSource } from '../codex/protocol';

interface LockState {
  token: string;
  release: () => void;
  timer: ReturnType<typeof setTimeout>;
  source: OperationSource;
}

export function createBrowserCommandCoordinator(api: BrowserTabsApi, journal: OperationJournal) {
  const journaledApi = createJournaledBrowserTabsApi(api, journal, 'manager');
  let tail: Promise<unknown> = Promise.resolve();
  let lock: LockState | undefined;

  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = tail.then(action);
    tail = result.catch(() => undefined);
    return result;
  }

  async function acquire(source: OperationSource = 'manager'): Promise<string> {
    const gate = tail;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    // Reserve the queue position before awaiting the previous command. This prevents
    // two pages that acquire at the same time from receiving overlapping locks.
    tail = held.catch(() => undefined);
    await gate;
    const token = crypto.randomUUID();
    const timer = setTimeout(() => {
      if (lock?.token !== token) return;
      lock = undefined;
      release();
    }, 120_000);
    lock = { token, release, timer, source };
    return token;
  }

  function release(token: string): void {
    if (!lock || lock.token !== token) return;
    clearTimeout(lock.timer);
    lock.release();
    lock = undefined;
  }

  async function executeCommand(command: BrowserCommand, token?: string, source: OperationSource = 'manager'): Promise<unknown> {
    if (token) {
      if (lock?.token !== token || lock.source !== source) throw new Error('The browser command lock is invalid or expired.');
      return executeJournaled(command, source);
    }
    return enqueue(() => executeJournaled(command, source));
  }

  async function runExclusive<T>(action: (scoped: BrowserTabsApi) => Promise<T>): Promise<T> {
    const token = await acquire('manager');
    try {
      return await action(createDirectApi(journaledApi));
    } finally {
      release(token);
    }
  }

  async function runExclusiveRaw<T>(action: (scoped: BrowserTabsApi) => Promise<T>): Promise<T> {
    const token = await acquire();
    try {
      return await action(createDirectApi(api));
    } finally {
      release(token);
    }
  }

  async function executeJournaled(command: BrowserCommand, source: OperationSource): Promise<unknown> {
    const journaled = source === 'manager' ? journaledApi : createJournaledBrowserTabsApi(api, journal, source);
    switch (command.kind) {
      case 'loadSnapshot': return api.loadSnapshot();
      case 'groupTabs': return journaled.groupTabs?.(command.tabIds, command.targetGroupId);
      case 'activateTab': return journaled.activateTab(command.tabId, command.windowId);
      case 'closeTabs': return journaled.closeTabs(command.tabIds);
      case 'createTabs': return journaled.createTabs?.(command.tabs);
      case 'createWindow': return journaled.createWindow?.(command.options);
      case 'updateWindow': return journaled.updateWindow?.(command.windowId, command.changes);
      case 'createGroup': return journaled.createGroup(command.tabIds, command.windowId, command.title, command.color);
      case 'discardTabs': return journaled.discardTabs(command.tabIds);
      case 'moveGroup': return journaled.moveGroup(command.groupId, command.targetWindowId, command.targetIndex);
      case 'moveTab': return journaled.moveTab(command.tabId, command.targetWindowId, command.targetIndex);
      case 'moveTabs': return journaled.moveTabs?.(command.tabIds, command.targetWindowId, command.targetIndex);
      case 'moveTabsToGroup': return journaled.moveTabsToGroup(command.tabIds, command.targetGroupId, command.targetWindowId);
      case 'moveTabToGroup': return journaled.moveTabToGroup(command.tabId, command.targetGroupId, command.targetWindowId);
      case 'ungroupTabs': return journaled.ungroupTabs(command.tabIds);
      case 'updateTab': return journaled.updateTab?.(command.tabId, command.changes);
      case 'updateGroup': return journaled.updateGroup(command.groupId, command.changes);
    }
  }

  return {
    acquire,
    release,
    executeCommand,
    runExclusive,
    runExclusiveRaw,
    /** Used by Codex/import/rollback while a single dispatch owns the queue. */
    api: createDirectApi(api)
  };
}

function createDirectApi(api: BrowserTabsApi): BrowserTabsApi {
  const scoped: BrowserTabsApi = { ...api, runExclusive: (action) => action(scoped) };
  return scoped;
}
