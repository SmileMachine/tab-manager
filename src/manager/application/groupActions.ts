import type { BrowserTabGroupColor, NativeGroupId, NativeWindowId } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';

type Notify = (message: string) => void;
type Refresh = () => void | Promise<unknown>;

export async function updateGroup({
  api,
  changes,
  groupId,
  notify = window.alert,
  refresh
}: {
  api: BrowserTabsApi | undefined;
  changes: { title?: string; color?: BrowserTabGroupColor };
  groupId: NativeGroupId;
  notify?: Notify;
  refresh?: Refresh;
}) {
  if (!api) {
    notify('Browser API unavailable.');
    return;
  }

  try {
    await api.updateGroup(groupId, changes);
    await refresh?.();
  } catch {
    notify('Unable to update group.');
  }
}

export async function moveGroupToWindow({
  api,
  groupId,
  notify = window.alert,
  refresh,
  targetWindowId
}: {
  api: BrowserTabsApi | undefined;
  groupId: NativeGroupId;
  notify?: Notify;
  refresh: Refresh;
  targetWindowId: NativeWindowId;
}) {
  if (!api) {
    notify('Browser API unavailable.');
    return;
  }

  try {
    await api.moveGroup(groupId, targetWindowId, -1);
    await refresh();
  } catch {
    notify('Unable to move group.');
  }
}
