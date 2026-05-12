import { planDiscardTabs } from '../../domain/commands';
import type { BrowserSnapshotView, NativeTabId, NativeWindowId } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';

type Notify = (message: string) => void;
type Refresh = () => void | Promise<unknown>;

interface ActionOptions {
  api: BrowserTabsApi | undefined;
  notify?: Notify;
}

export async function activateTab({
  api,
  notify = window.alert,
  tabId,
  windowId
}: ActionOptions & {
  refresh?: Refresh;
  tabId: NativeTabId;
  windowId: NativeWindowId;
}) {
  if (!api) {
    notify('Browser API unavailable.');
    return;
  }

  try {
    await api.activateTab(tabId, windowId);
  } catch {
    notify('Unable to activate tab.');
  }
}

export async function closeTabs({
  api,
  notify = window.alert,
  refresh,
  tabIds
}: ActionOptions & {
  refresh: Refresh;
  tabIds: NativeTabId[];
}) {
  if (!api) {
    notify('Browser API unavailable.');
    return;
  }

  try {
    await api.closeTabs(tabIds);
    await refresh();
  } catch {
    notify('Unable to close tabs.');
  }
}

export async function discardTabs({
  api,
  notify = window.alert,
  refresh,
  selectedTabIds,
  view
}: ActionOptions & {
  refresh: Refresh;
  selectedTabIds: ReadonlySet<NativeTabId>;
  view: BrowserSnapshotView;
}) {
  const plan = planDiscardTabs(view, selectedTabIds);

  if (!api || !plan.enabled) {
    notify(plan.enabled ? 'Browser API unavailable.' : 'No inactive tabs can be released.');
    return;
  }

  try {
    await api.discardTabs(plan.tabIds);
    await refresh();
  } catch {
    notify('Unable to release tab memory.');
  }
}
