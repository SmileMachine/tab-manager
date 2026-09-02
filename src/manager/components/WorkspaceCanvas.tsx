import type { BrowserSnapshotView, NativeGroupId, NativeTabId, NativeWindowId } from '../../domain/types';
import { displayNameForWindow } from '../view/groupOptions';
import type { GroupEditMenuState } from './GroupEditPopover';
import { WindowSection, type WindowSectionProps } from './WindowSection';

export type WorkspaceCanvasProps = Omit<WindowSectionProps, 'defaultWindowName' | 'index' | 'windowView'> & {
  defaultWindowName?: (windowId: NativeWindowId, index: number) => string;
  view: BrowserSnapshotView;
};

export function WorkspaceCanvas({ defaultWindowName, view, ...windowProps }: WorkspaceCanvasProps) {
  return (
    <section className="manager-content workspace-canvas">
      {view.windows.map((windowView, index) => (
        <WindowSection
          {...windowProps}
          defaultWindowName={defaultWindowName?.(windowView.id, index) ?? displayNameForWindow(windowView.id, index, {})}
          index={index}
          key={windowView.id}
          windowView={windowView}
        />
      ))}
    </section>
  );
}

export type WorkspaceCanvasCallbacks = Pick<WindowSectionProps,
  'onActivateTab' |
  'onCloseTab' |
  'onOpenGroupMenu' |
  'onOpenTabContextMenu' |
  'onSelectTab' |
  'onSortableChange' |
  'onSortableStart' |
  'onToggleGroup' |
  'onToggleWindow' |
  'onUpdateWindowName'
>;

export type WorkspaceCanvasSelection = {
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  collapsedWindowIds: ReadonlySet<NativeWindowId>;
  contextSourceTabId: NativeTabId | undefined;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
};

export type WorkspaceCanvasMenuHandler = (state: GroupEditMenuState) => void;
