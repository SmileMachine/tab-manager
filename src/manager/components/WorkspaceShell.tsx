import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, Menu, PanelRightClose, PanelRightOpen } from 'lucide-react';

export const WORKSPACE_SIDEBAR_MIN_WIDTH = 200;
export const WORKSPACE_SIDEBAR_MAX_WIDTH = 420;
export const WORKSPACE_SIDEBAR_DEFAULT_WIDTH = 252;
export const WORKSPACE_AGENT_MIN_WIDTH = 300;
export const WORKSPACE_AGENT_MAX_WIDTH = 560;
export const WORKSPACE_AGENT_DEFAULT_WIDTH = 380;
const WORKSPACE_SIDEBAR_KEYBOARD_STEP = 16;

export interface WorkspaceShellProps {
  sidebar: ReactNode;
  toolbar: ReactNode;
  contentToolbar?: ReactNode;
  children: ReactNode;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  onToggleSidebar: () => void;
  agentSidebar?: ReactNode;
  agentCollapsed?: boolean;
  agentWidth?: number;
  onAgentWidthChange?: (width: number) => void;
  onToggleAgent?: () => void;
}

interface ResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

/** Shared frame for workspace navigation, content, and the optional Agent side panel. */
export function WorkspaceShell({
  sidebar,
  toolbar,
  contentToolbar,
  children,
  sidebarCollapsed,
  sidebarWidth,
  onSidebarWidthChange,
  onToggleSidebar,
  agentSidebar,
  agentCollapsed = false,
  agentWidth = WORKSPACE_AGENT_DEFAULT_WIDTH,
  onAgentWidthChange,
  onToggleAgent
}: WorkspaceShellProps) {
  const sidebarResize = useRef<ResizeState | undefined>(undefined);
  const agentResize = useRef<ResizeState | undefined>(undefined);
  const [resizing, setResizing] = useState<'sidebar' | 'agent' | undefined>();
  const width = clamp(sidebarWidth, WORKSPACE_SIDEBAR_MIN_WIDTH, WORKSPACE_SIDEBAR_MAX_WIDTH);
  const agentPanelWidth = clamp(agentWidth, WORKSPACE_AGENT_MIN_WIDTH, WORKSPACE_AGENT_MAX_WIDTH);
  const hasAgent = agentSidebar !== undefined;
  const shellStyle = {
    '--workspace-sidebar-width': `${sidebarCollapsed ? 0 : width}px`,
    '--workspace-agent-width': `${agentCollapsed ? 0 : agentPanelWidth}px`
  } as CSSProperties;

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    const state = sidebarResize.current?.pointerId === event.pointerId ? sidebarResize : agentResize.current?.pointerId === event.pointerId ? agentResize : undefined;
    if (!state) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    state.current = undefined;
    setResizing(undefined);
  };

  const startResize = (kind: 'sidebar' | 'agent', event: PointerEvent<HTMLDivElement>) => {
    if (kind === 'sidebar' && sidebarCollapsed) return;
    if (kind === 'agent' && (agentCollapsed || !onAgentWidthChange)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    (kind === 'sidebar' ? sidebarResize : agentResize).current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: kind === 'sidebar' ? width : agentPanelWidth
    };
    setResizing(kind);
  };

  const moveResize = (kind: 'sidebar' | 'agent', event: PointerEvent<HTMLDivElement>) => {
    const state = (kind === 'sidebar' ? sidebarResize : agentResize).current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (kind === 'sidebar') onSidebarWidthChange(clamp(state.startWidth + event.clientX - state.startX, WORKSPACE_SIDEBAR_MIN_WIDTH, WORKSPACE_SIDEBAR_MAX_WIDTH));
    else onAgentWidthChange?.(clamp(state.startWidth - event.clientX + state.startX, WORKSPACE_AGENT_MIN_WIDTH, WORKSPACE_AGENT_MAX_WIDTH));
  };

  const resizeKeyDown = (kind: 'sidebar' | 'agent', event: KeyboardEvent<HTMLDivElement>) => {
    if (kind === 'sidebar' && sidebarCollapsed) return;
    if (kind === 'agent' && (agentCollapsed || !onAgentWidthChange)) return;
    const current = kind === 'sidebar' ? width : agentPanelWidth;
    const sign = kind === 'sidebar' ? 1 : -1;
    let next: number | undefined;
    if (event.key === 'ArrowLeft') next = current - sign * WORKSPACE_SIDEBAR_KEYBOARD_STEP;
    if (event.key === 'ArrowRight') next = current + sign * WORKSPACE_SIDEBAR_KEYBOARD_STEP;
    if (event.key === 'Home') next = kind === 'sidebar' ? WORKSPACE_SIDEBAR_MIN_WIDTH : WORKSPACE_AGENT_MAX_WIDTH;
    if (event.key === 'End') next = kind === 'sidebar' ? WORKSPACE_SIDEBAR_MAX_WIDTH : WORKSPACE_AGENT_MIN_WIDTH;
    if (next === undefined) return;
    event.preventDefault();
    if (kind === 'sidebar') onSidebarWidthChange(clamp(next, WORKSPACE_SIDEBAR_MIN_WIDTH, WORKSPACE_SIDEBAR_MAX_WIDTH));
    else onAgentWidthChange?.(clamp(next, WORKSPACE_AGENT_MIN_WIDTH, WORKSPACE_AGENT_MAX_WIDTH));
  };

  return (
    <section
      className={`workspace-shell ${hasAgent ? 'has-agent-sidebar' : ''} ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${agentCollapsed ? 'is-agent-collapsed' : ''} ${resizing ? `is-${resizing}-resizing` : ''}`}
      style={shellStyle}
    >
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <div className="workspace-sidebar-content">{sidebar}</div>
        <ResizeSeparator className="workspace-sidebar-resizer" label="Resize workspace sidebar" value={width} min={WORKSPACE_SIDEBAR_MIN_WIDTH} max={WORKSPACE_SIDEBAR_MAX_WIDTH} disabled={sidebarCollapsed} onKeyDown={(event) => resizeKeyDown('sidebar', event)} onPointerCancel={stopResize} onPointerDown={(event) => startResize('sidebar', event)} onPointerMove={(event) => moveResize('sidebar', event)} onPointerUp={stopResize} />
      </aside>
      <section className={`workspace-main${contentToolbar ? ' has-content-toolbar' : ''}`} aria-label="Workspace content">
        <header className="workspace-toolbar">
          <button aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'} className="workspace-sidebar-toggle icon-button" type="button" onClick={onToggleSidebar}>
            {sidebarCollapsed ? <Menu aria-hidden="true" size={18} /> : <ChevronLeft aria-hidden="true" size={18} />}
          </button>
          <div className="workspace-toolbar-content">{toolbar}</div>
          {hasAgent && onToggleAgent ? <button aria-expanded={!agentCollapsed} aria-label={agentCollapsed ? 'Expand Organizer Agent' : 'Collapse Organizer Agent'} className="workspace-agent-toggle icon-button" type="button" onClick={onToggleAgent}>
            {agentCollapsed ? <PanelRightOpen aria-hidden="true" size={18} /> : <PanelRightClose aria-hidden="true" size={18} />}
          </button> : null}
        </header>
        {contentToolbar}
        <div className="workspace-main-content">{children}</div>
      </section>
      {hasAgent ? <aside className="workspace-agent-sidebar" aria-label="Organizer Agent">
        <ResizeSeparator className="workspace-agent-resizer" label="Resize Organizer Agent sidebar" value={agentPanelWidth} min={WORKSPACE_AGENT_MIN_WIDTH} max={WORKSPACE_AGENT_MAX_WIDTH} disabled={agentCollapsed || !onAgentWidthChange} onKeyDown={(event) => resizeKeyDown('agent', event)} onPointerCancel={stopResize} onPointerDown={(event) => startResize('agent', event)} onPointerMove={(event) => moveResize('agent', event)} onPointerUp={stopResize} />
        <div className="workspace-agent-sidebar-content">{agentSidebar}</div>
      </aside> : null}
    </section>
  );
}

function ResizeSeparator({ className, label, value, min, max, disabled, ...props }: { className: string; label: string; value: number; min: number; max: number; disabled: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-label={label} aria-orientation="vertical" aria-valuemax={max} aria-valuemin={min} aria-valuenow={value} className={className} role="separator" tabIndex={disabled ? -1 : 0} />;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
