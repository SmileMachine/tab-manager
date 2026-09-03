import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, Menu } from 'lucide-react';

export const WORKSPACE_SIDEBAR_MIN_WIDTH = 200;
export const WORKSPACE_SIDEBAR_MAX_WIDTH = 420;
export const WORKSPACE_SIDEBAR_DEFAULT_WIDTH = 252;
const WORKSPACE_SIDEBAR_KEYBOARD_STEP = 16;

export interface WorkspaceShellProps {
  sidebar: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  onToggleSidebar: () => void;
}

interface SidebarResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

/** Shared two-pane frame for Current, named snapshots, history, and diff views. */
export function WorkspaceShell({
  sidebar,
  toolbar,
  children,
  sidebarCollapsed,
  sidebarWidth,
  onSidebarWidthChange,
  onToggleSidebar
}: WorkspaceShellProps) {
  const resizeState = useRef<SidebarResizeState | undefined>(undefined);
  const [isResizing, setIsResizing] = useState(false);
  const width = clampSidebarWidth(sidebarWidth);
  const shellStyle = { '--workspace-sidebar-width': `${width}px` } as CSSProperties;

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeState.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    resizeState.current = undefined;
    setIsResizing(false);
  };

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeState.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    setIsResizing(true);
  };

  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = resizeState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    onSidebarWidthChange(clampSidebarWidth(state.startWidth + event.clientX - state.startX));
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    let nextWidth: number | undefined;
    if (event.key === 'ArrowLeft') nextWidth = width - WORKSPACE_SIDEBAR_KEYBOARD_STEP;
    if (event.key === 'ArrowRight') nextWidth = width + WORKSPACE_SIDEBAR_KEYBOARD_STEP;
    if (event.key === 'Home') nextWidth = WORKSPACE_SIDEBAR_MIN_WIDTH;
    if (event.key === 'End') nextWidth = WORKSPACE_SIDEBAR_MAX_WIDTH;
    if (nextWidth === undefined) return;
    event.preventDefault();
    onSidebarWidthChange(clampSidebarWidth(nextWidth));
  };

  return (
    <section
      className={`workspace-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${isResizing ? 'is-sidebar-resizing' : ''}`}
      style={shellStyle}
    >
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <div className="workspace-sidebar-content">{sidebar}</div>
        <div
          aria-label="Resize workspace sidebar"
          aria-orientation="vertical"
          aria-valuemax={WORKSPACE_SIDEBAR_MAX_WIDTH}
          aria-valuemin={WORKSPACE_SIDEBAR_MIN_WIDTH}
          aria-valuenow={width}
          className="workspace-sidebar-resizer"
          role="separator"
          tabIndex={sidebarCollapsed ? -1 : 0}
          onKeyDown={handleResizeKeyDown}
          onPointerCancel={stopResize}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={stopResize}
        />
      </aside>
      <section className="workspace-main" aria-label="Workspace content">
        <header className="workspace-toolbar">
          <button
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
            className="workspace-sidebar-toggle icon-button"
            type="button"
            onClick={onToggleSidebar}
          >
            {sidebarCollapsed ? <Menu aria-hidden="true" size={18} /> : <ChevronLeft aria-hidden="true" size={18} />}
          </button>
          <div className="workspace-toolbar-content">{toolbar}</div>
        </header>
        <div className="workspace-main-content">{children}</div>
      </section>
    </section>
  );
}

function clampSidebarWidth(width: number) {
  return Math.min(WORKSPACE_SIDEBAR_MAX_WIDTH, Math.max(WORKSPACE_SIDEBAR_MIN_WIDTH, width));
}
