import { planMoveGroup, type GroupDropTarget } from '../../domain/commands';
import type { BrowserSnapshotView, NativeGroupId } from '../../domain/types';
import type { BrowserTabsApi } from '../../infrastructure/browserTabsApi';

type Notify = (message: string) => void;
type Refresh = () => void | Promise<unknown>;

export async function moveGroup({
  api,
  groupId,
  notify = window.alert,
  refresh,
  target,
  view
}: {
  api: BrowserTabsApi | undefined;
  groupId: NativeGroupId;
  notify?: Notify;
  refresh: Refresh;
  target: GroupDropTarget | undefined;
  view: BrowserSnapshotView;
}) {
  if (!api) {
    notify('Browser API unavailable.');
    return;
  }

  if (!target) {
    return;
  }

  const plan = planMoveGroup(view, groupId, target);

  if (!plan.enabled) {
    return;
  }

  try {
    await api.moveGroup(plan.move.groupId, plan.move.windowId, plan.move.index);
    await refresh();
  } catch {
    notify('Unable to move group.');
  }
}
