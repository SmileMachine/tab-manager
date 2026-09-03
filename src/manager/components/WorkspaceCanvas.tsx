import type { BrowserSnapshotView, NativeWindowId } from '../../domain/types';
import { displayNameForWindow } from '../view/groupOptions';
import { WindowSection, type WindowSectionProps } from './WindowSection';

export type WorkspaceCanvasProps = Omit<WindowSectionProps, 'defaultWindowName' | 'index' | 'windowName' | 'windowView'> & {
  defaultWindowName?: (windowId: NativeWindowId, index: number) => string;
  windowName?: (windowId: NativeWindowId, index: number) => string | undefined;
  view: BrowserSnapshotView;
};

export function WorkspaceCanvas({ defaultWindowName, view, windowName, ...windowProps }: WorkspaceCanvasProps) {
  return (
    <section className="manager-content workspace-canvas">
      {view.windows.map((windowView, index) => (
        <WindowSection
          {...windowProps}
          defaultWindowName={defaultWindowName?.(windowView.id, index) ?? displayNameForWindow(windowView.id, index, {})}
          index={index}
          key={windowView.id}
          windowName={windowName?.(windowView.id, index)}
          windowView={windowView}
        />
      ))}
    </section>
  );
}
