import { createSnapshotRevision } from '../codex/snapshot';
import type { OperationJournal } from '../codex/operationJournal';
import type { OperationRecord, OperationSource } from '../codex/protocol';
import type { BrowserTabGroupColor } from '../domain/types';
import type { BrowserTabsApi } from './browserTabsApi';

export function createJournaledBrowserTabsApi(
  api: BrowserTabsApi,
  journal: OperationJournal,
  source: OperationSource = 'manager'
): BrowserTabsApi {
  const journaled: BrowserTabsApi = {
    loadSnapshot: () => api.loadSnapshot(),
    activateTab: (tabId, windowId) =>
      execute(api, journal, source, 'activateTab', { tabId, windowId }, () => api.activateTab(tabId, windowId)),
    closeTabs: (tabIds) => execute(api, journal, source, 'closeTabs', { tabIds }, () => api.closeTabs(tabIds)),
    createGroup: (tabIds, windowId, title, color) =>
      execute(api, journal, source, 'createGroup', { tabIds, windowId, title, color }, () =>
        api.createGroup(tabIds, windowId, title, color)
      ),
    discardTabs: (tabIds) => execute(api, journal, source, 'discardTabs', { tabIds }, () => api.discardTabs(tabIds)),
    moveGroup: (groupId, targetWindowId, targetIndex) =>
      execute(api, journal, source, 'moveGroup', { groupId, targetWindowId, targetIndex }, () =>
        api.moveGroup(groupId, targetWindowId, targetIndex)
      ),
    moveTab: (tabId, targetWindowId, targetIndex) =>
      execute(api, journal, source, 'moveTab', { tabId, targetWindowId, targetIndex }, () =>
        api.moveTab(tabId, targetWindowId, targetIndex)
      ),
    moveTabsToGroup: (tabIds, targetGroupId, targetWindowId) =>
      execute(api, journal, source, 'moveTabsToGroup', { tabIds, targetGroupId, targetWindowId }, () =>
        api.moveTabsToGroup(tabIds, targetGroupId, targetWindowId)
      ),
    moveTabToGroup: (tabId, targetGroupId) =>
      execute(api, journal, source, 'moveTabToGroup', { tabId, targetGroupId }, () => api.moveTabToGroup(tabId, targetGroupId)),
    ungroupTabs: (tabIds) => execute(api, journal, source, 'ungroupTabs', { tabIds }, () => api.ungroupTabs(tabIds)),
    updateGroup: (groupId, changes) =>
      execute(api, journal, source, 'updateGroup', { groupId, changes: groupChangesSummary(changes) }, () =>
        api.updateGroup(groupId, changes)
      )
  };

  if (api.createTabs) {
    journaled.createTabs = (tabs) => execute(api, journal, source, 'createTabs', { tabs }, () => api.createTabs!(tabs));
  }
  if (api.moveTabs) {
    journaled.moveTabs = (tabIds, targetWindowId, targetIndex) =>
      execute(api, journal, source, 'moveTabs', { tabIds, targetWindowId, targetIndex }, () => api.moveTabs!(tabIds, targetWindowId, targetIndex));
  }
  if (api.updateTab) {
    journaled.updateTab = (tabId, changes) =>
      execute(api, journal, source, 'updateTab', { tabId, changes }, () => api.updateTab!(tabId, changes));
  }

  return journaled;
}

async function execute<T>(
  api: BrowserTabsApi,
  journal: OperationJournal,
  source: OperationSource,
  operationType: string,
  requestSummary: NonNullable<OperationRecord['requestSummary']>,
  action: () => Promise<T>
): Promise<T> {
  const beforeSnapshot = await api.loadSnapshot();
  const record = await journal.begin({ source, operationType, beforeSnapshot, requestSummary });

  try {
    const result = await action();
    const afterSnapshot = await api.loadSnapshot();
    await journal.complete(record, { afterSnapshot });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser operation failed.';

    try {
      const afterSnapshot = await api.loadSnapshot();
      const status = createSnapshotRevision(beforeSnapshot) === createSnapshotRevision(afterSnapshot) ? 'failed' : 'partially-failed';
      await journal.complete(record, { afterSnapshot, status, errors: [message] });
    } catch (journalError) {
      const journalMessage = journalError instanceof Error ? journalError.message : 'Operation journal could not record the final state.';
      throw new Error(`${message} ${journalMessage}`);
    }

    throw error;
  }
}

function groupChangesSummary(changes: { title?: string; color?: BrowserTabGroupColor }): Record<string, string> {
  const summary: Record<string, string> = {};
  if (changes.title !== undefined) summary.title = changes.title;
  if (changes.color !== undefined) summary.color = changes.color;
  return summary;
}
